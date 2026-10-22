import { execFileSync } from 'node:child_process';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { e2eEnv } from '../playwright.config.ts';

const API = 'http://127.0.0.1:3100';
const PASSWORD = 'correct horse battery staple';

async function registerAndVerify(browser: Browser, name: string, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/register');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  const mail = await (
    await page.request.get(`${API}/api/dev/mailbox?email=${encodeURIComponent(email)}`)
  ).json();
  const link = new URL(mail.message.text.match(/https?:\/\/\S+/)[0]);
  await page.goto(link.pathname + link.search);
  await expect(page.getByText('Your email is verified.')).toBeVisible();

  await signIn(page, email);
  return page;
}

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

async function claim(page: Page, role: string, department: string, year: string) {
  await page.goto('/onboarding');
  await page.getByLabel('I am a').selectOption(role);
  await page.getByLabel('Department').fill(department);
  await page.getByLabel('Graduation year (optional)').fill(year);
  await page.getByRole('button', { name: 'Submit claim' }).click();
}

test('student discovers an admin-verified alumnus and they connect', async ({ browser }) => {
  // 1. Student with a university mailbox is verified automatically.
  const student = await registerAndVerify(browser, 'Asha Student', 'asha@students.uni.edu');
  await claim(student, 'student', 'Computer Science', '2027');
  await expect(student.getByTestId('verification-state')).toContainText('verified');

  // 2. Alumna without a university mailbox waits for review and is not yet discoverable.
  const alum = await registerAndVerify(browser, 'Priya Natarajan', 'priya.n@gmail.com');
  await claim(alum, 'alumni', 'Computer Science', '2012');
  await expect(alum.getByTestId('verification-state')).toContainText('Waiting for review');
  await alum.goto('/profile');
  await alum.getByLabel('Headline').fill('Staff engineer, happy to mentor on systems careers');
  await alum.getByLabel('Current company').fill('Google');
  await alum.getByLabel('Skills').fill('Distributed Systems, Go');
  await alum.getByLabel('I am open to mentoring').check();
  await alum.getByRole('button', { name: 'Save profile' }).click();
  await expect(alum.getByRole('status')).toContainText('Saved');

  await student.goto('/discover');
  await student.getByLabel('Company').fill('google');
  await student.getByRole('button', { name: 'Search' }).click();
  await expect(student.getByText('No members match these filters yet.')).toBeVisible();

  // 3. An administrator (granted only via the CLI) verifies the claim.
  const admin = await registerAndVerify(browser, 'Alumni Office', 'office@ops.example');
  execFileSync(
    'pnpm',
    ['--filter', '@alumni/api', 'exec', 'tsx', 'scripts/grant-admin.ts', 'office@ops.example'],
    {
      env: { ...process.env, ...e2eEnv },
    },
  );
  await admin.goto('/admin/verification');
  const card = admin.getByTestId('case').filter({ hasText: 'priya.n@gmail.com' });
  await card.getByLabel('Decision rationale').fill('Matched 2012 CS convocation list');
  await card.getByRole('button', { name: 'Verify' }).click();
  await expect(admin.getByText('No claims are waiting for review.')).toBeVisible();

  // 4. The student finds her and sends a request.
  await student.goto('/discover');
  await student.getByLabel('Company').fill('google');
  await student.getByLabel('Open to mentoring').check();
  await student.getByRole('button', { name: 'Search' }).click();
  await student.getByRole('link', { name: 'Priya Natarajan' }).click();
  await student
    .getByLabel('Add a note (optional)')
    .fill('Hi Priya, I would value advice on distributed-systems roles.');
  await student.getByRole('button', { name: 'Send connection request' }).click();
  await expect(student.getByTestId('relationship')).toHaveAttribute('data-state', 'request_sent');

  // 5. She accepts; both see the connection.
  await alum.goto('/connections');
  const request = alum.getByTestId('incoming-request').filter({ hasText: 'Asha Student' });
  await expect(request).toContainText('distributed-systems roles');
  await request.getByRole('button', { name: 'Accept' }).click();
  await expect(alum.getByTestId('connections')).toContainText('Asha Student');

  await student.goto('/connections');
  await expect(student.getByTestId('connections')).toContainText('Priya Natarajan');
});
