# Directory search benchmark — 2026-10-22T08:13:06.463Z
node v22.22.0; 4 vCPU (Intel(R) Xeon(R) Processor @ 2.10GHz); 15.7 GiB RAM
PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1) on x86_64-pc-linux-gnu, compiled by gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0, 64-bit
warm-up 20, repetitions 200, sequential, limit 20, client and server on the same host

## 10,000 profiles (seeded in 3.0 s)

| query | results | p50 ms | p95 ms | p99 ms |
|---|---:|---:|---:|---:|
| browse (no filters) | 20 | 4.27 | 8.70 | 12.81 |
| department + year range | 20 | 6.05 | 8.61 | 11.04 |
| skill filter | 20 | 7.93 | 9.91 | 13.76 |
| company substring | 20 | 3.87 | 5.73 | 7.62 |
| mentors in a city | 20 | 4.33 | 5.10 | 6.33 |
| text: one word | 20 | 20.66 | 31.49 | 38.40 |
| text: name prefix | 20 | 20.67 | 26.46 | 29.38 |
| text: name with typo | 20 | 25.57 | 32.54 | 34.74 |
| text + filters | 20 | 7.01 | 9.44 | 11.22 |
| browse page 5 (cursor) | 20 | 3.78 | 4.73 | 5.47 |

<details><summary>Query plans (10,000 profiles)</summary>

### browse (no filters)

```
Limit (actual time=0.047..0.236 rows=21 loops=1)
  Buffers: shared hit=234
  ->  Nested Loop (actual time=0.042..0.228 rows=21 loops=1)
        Buffers: shared hit=234
        ->  Nested Loop Anti Join (actual time=0.037..0.174 rows=21 loops=1)
              Join Filter: (b_1.blocker_id = p.user_id)
              Buffers: shared hit=171
              ->  Nested Loop Anti Join (actual time=0.027..0.158 rows=21 loops=1)
                    Buffers: shared hit=170
                    ->  Nested Loop (actual time=0.023..0.138 rows=21 loops=1)
                          Buffers: shared hit=149
                          ->  Nested Loop (actual time=0.017..0.085 rows=21 loops=1)
                                Buffers: shared hit=86
                                ->  Index Scan using profiles_name_order_idx on profiles p (actual time=0.010..0.027 rows=21 loops=1)
                                      Filter: (user_id <> '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid)
                                      Buffers: shared hit=23
                                ->  Index Scan using affiliation_claims_user_id_key on affiliation_claims ac (actual time=0.002..0.002 rows=1 loops=21)
                                      Index Cond: (user_id = p.user_id)
                                      Buffers: shared hit=63
                          ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.002..0.002 rows=1 loops=21)
                                Index Cond: (claim_id = ac.id)
                                Filter: (state = 'verified'::text)
                                Buffers: shared hit=63
                    ->  Index Only Scan using blocks_pkey on blocks b (actual time=0.001..0.001 rows=0 loops=21)
                          Index Cond: ((blocker_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid) AND (blocked_id = p.user_id))
                          Heap Fetches: 0
                          Buffers: shared hit=21
              ->  Materialize (actual time=0.000..0.000 rows=0 loops=21)
                    Buffers: shared hit=1
                    ->  Seq Scan on blocks b_1 (actual time=0.008..0.008 rows=0 loops=1)
                          Filter: (blocked_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid)
                          Rows Removed by Filter: 50
                          Buffers: shared hit=1
        ->  Index Scan using users_pkey on users u (actual time=0.002..0.002 rows=1 loops=21)
              Index Cond: (id = p.user_id)
              Filter: (status = 'active'::text)
              Buffers: shared hit=63
Planning:
  Buffers: shared hit=64
Planning Time: 1.986 ms
Execution Time: 0.279 ms
```

### department + year range

```
Limit (actual time=4.294..4.301 rows=21 loops=1)
  Buffers: shared hit=771
  ->  Sort (actual time=4.292..4.298 rows=21 loops=1)
        Sort Key: p.display_name, p.user_id
        Sort Method: top-N heapsort  Memory: 33kB
        Buffers: shared hit=771
        ->  Nested Loop Anti Join (actual time=2.157..4.206 rows=131 loops=1)
              Join Filter: (b_1.blocker_id = p.user_id)
              Buffers: shared hit=771
              ->  Hash Anti Join (actual time=2.150..4.166 rows=131 loops=1)
                    Hash Cond: (p.user_id = b.blocked_id)
                    Buffers: shared hit=770
                    ->  Nested Loop (actual time=2.122..4.113 rows=131 loops=1)
                          Buffers: shared hit=769
                          ->  Hash Join (actual time=2.104..3.799 rows=137 loops=1)
                                Hash Cond: (vc.claim_id = ac.id)
                                Buffers: shared hit=358
                                ->  Seq Scan on verification_cases vc (actual time=0.005..1.005 rows=9007 loops=1)
                                      Filter: (state = 'verified'::text)
                                      Rows Removed by Filter: 993
                                      Buffers: shared hit=134
                                ->  Hash (actual time=2.058..2.060 rows=155 loops=1)
                                      Buckets: 1024  Batches: 1  Memory Usage: 25kB
                                      Buffers: shared hit=224
                                      ->  Hash Join (actual time=0.148..2.020 rows=155 loops=1)
                                            Hash Cond: (u.id = ac.user_id)
                                            Buffers: shared hit=224
                                            ->  Seq Scan on users u (actual time=0.003..1.091 rows=10000 loops=1)
                                                  Filter: (status = 'active'::text)
                                                  Buffers: shared hit=133
                                            ->  Hash (actual time=0.120..0.121 rows=155 loops=1)
                                                  Buckets: 1024  Batches: 1  Memory Usage: 23kB
                                                  Buffers: shared hit=91
                                                  ->  Bitmap Heap Scan on affiliation_claims ac (actual time=0.032..0.092 rows=155 loops=1)
                                                        Recheck Cond: ((lower(department) = 'computer science'::text) AND (graduation_year >= 2010) AND (graduation_year <= 2015))
                                                        Heap Blocks: exact=88
                                                        Buffers: shared hit=91
                                                        ->  Bitmap Index Scan on affiliation_claims_dept_year_idx (actual time=0.014..0.014 rows=155 loops=1)
                                                              Index Cond: ((lower(department) = 'computer science'::text) AND (graduation_year >= 2010) AND (graduation_year <= 2015))
                                                              Buffers: shared hit=3
                          ->  Index Scan using profiles_pkey on profiles p (actual time=0.002..0.002 rows=1 loops=137)
                                Index Cond: (user_id = u.id)
                                Filter: ((user_id <> '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid) AND (discoverability = 'verified_members'::text))
                                Rows Removed by Filter: 0
                                Buffers: shared hit=411
                    ->  Hash (actual time=0.020..0.021 rows=50 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 11kB
                          Buffers: shared hit=1
                          ->  Seq Scan on blocks b (actual time=0.006..0.012 rows=50 loops=1)
                                Filter: (blocker_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid)
                                Buffers: shared hit=1
              ->  Materialize (actual time=0.000..0.000 rows=0 loops=131)
                    Buffers: shared hit=1
                    ->  Seq Scan on blocks b_1 (actual time=0.004..0.004 rows=0 loops=1)
                          Filter: (blocked_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid)
                          Rows Removed by Filter: 50
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=64
Planning Time: 1.563 ms
Execution Time: 4.357 ms
```

### skill filter

```
Limit (actual time=0.061..0.511 rows=21 loops=1)
  Buffers: shared hit=523
  ->  Nested Loop Anti Join (actual time=0.060..0.507 rows=21 loops=1)
        Join Filter: (b_1.blocker_id = p.user_id)
        Buffers: shared hit=523
        ->  Nested Loop (actual time=0.049..0.489 rows=21 loops=1)
              Buffers: shared hit=522
              ->  Nested Loop Anti Join (actual time=0.045..0.440 rows=21 loops=1)
                    Buffers: shared hit=459
                    ->  Nested Loop (actual time=0.042..0.414 rows=21 loops=1)
                          Buffers: shared hit=438
                          ->  Nested Loop (actual time=0.036..0.360 rows=22 loops=1)
                                Buffers: shared hit=372
                                ->  Nested Loop (actual time=0.031..0.306 rows=22 loops=1)
                                      Buffers: shared hit=306
                                      ->  Index Scan using profiles_name_order_idx on profiles p (actual time=0.012..0.080 rows=101 loops=1)
                                            Filter: (user_id <> '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid)
                                            Buffers: shared hit=103
                                      ->  Index Only Scan using profile_skills_pkey on profile_skills s (actual time=0.002..0.002 rows=0 loops=101)
                                            Index Cond: ((user_id = p.user_id) AND (skill = 'kubernetes'::text))
                                            Heap Fetches: 0
                                            Buffers: shared hit=203
                                ->  Index Scan using affiliation_claims_user_id_key on affiliation_claims ac (actual time=0.002..0.002 rows=1 loops=22)
                                      Index Cond: (user_id = p.user_id)
                                      Buffers: shared hit=66
                          ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.002..0.002 rows=1 loops=22)
                                Index Cond: (claim_id = ac.id)
                                Filter: (state = 'verified'::text)
                                Rows Removed by Filter: 0
                                Buffers: shared hit=66
                    ->  Index Only Scan using blocks_pkey on blocks b (actual time=0.001..0.001 rows=0 loops=21)
                          Index Cond: ((blocker_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid) AND (blocked_id = p.user_id))
                          Heap Fetches: 0
                          Buffers: shared hit=21
              ->  Index Scan using users_pkey on users u (actual time=0.002..0.002 rows=1 loops=21)
                    Index Cond: (id = p.user_id)
                    Filter: (status = 'active'::text)
                    Buffers: shared hit=63
        ->  Materialize (actual time=0.001..0.001 rows=0 loops=21)
              Buffers: shared hit=1
              ->  Seq Scan on blocks b_1 (actual time=0.009..0.009 rows=0 loops=1)
                    Filter: (blocked_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid)
                    Rows Removed by Filter: 50
                    Buffers: shared hit=1
Planning:
  Buffers: shared hit=100
Planning Time: 7.075 ms
Execution Time: 0.565 ms
```

### company substring

```
Limit (actual time=0.095..0.557 rows=21 loops=1)
  Buffers: shared hit=674
  ->  Nested Loop Anti Join (actual time=0.095..0.554 rows=21 loops=1)
        Join Filter: (b_1.blocker_id = p.user_id)
        Buffers: shared hit=674
        ->  Nested Loop Anti Join (actual time=0.083..0.537 rows=21 loops=1)
              Buffers: shared hit=673
              ->  Nested Loop (actual time=0.080..0.519 rows=21 loops=1)
                    Buffers: shared hit=652
                    ->  Nested Loop (actual time=0.076..0.469 rows=22 loops=1)
                          Buffers: shared hit=586
                          ->  Nested Loop (actual time=0.072..0.424 rows=22 loops=1)
                                Buffers: shared hit=520
                                ->  Index Scan using profiles_name_order_idx on profiles p (actual time=0.064..0.369 rows=22 loops=1)
                                      Filter: ((user_id <> '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid) AND (current_company ~~* '%micro%'::text))
                                      Rows Removed by Filter: 427
                                      Buffers: shared hit=454
                                ->  Index Scan using users_pkey on users u (actual time=0.002..0.002 rows=1 loops=22)
                                      Index Cond: (id = p.user_id)
                                      Filter: (status = 'active'::text)
                                      Buffers: shared hit=66
                          ->  Index Scan using affiliation_claims_user_id_key on affiliation_claims ac (actual time=0.002..0.002 rows=1 loops=22)
                                Index Cond: (user_id = u.id)
                                Buffers: shared hit=66
                    ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.002..0.002 rows=1 loops=22)
                          Index Cond: (claim_id = ac.id)
                          Filter: (state = 'verified'::text)
                          Rows Removed by Filter: 0
                          Buffers: shared hit=66
              ->  Index Only Scan using blocks_pkey on blocks b (actual time=0.001..0.001 rows=0 loops=21)
                    Index Cond: ((blocker_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid) AND (blocked_id = p.user_id))
                    Heap Fetches: 0
                    Buffers: shared hit=21
        ->  Materialize (actual time=0.001..0.001 rows=0 loops=21)
              Buffers: shared hit=1
              ->  Seq Scan on blocks b_1 (actual time=0.009..0.009 rows=0 loops=1)
                    Filter: (blocked_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid)
                    Rows Removed by Filter: 50
                    Buffers: shared hit=1
Planning:
  Buffers: shared hit=65
Planning Time: 1.839 ms
Execution Time: 0.602 ms
```

### mentors in a city

```
Limit (actual time=0.057..0.860 rows=21 loops=1)
  Buffers: shared hit=1107
  ->  Nested Loop Anti Join (actual time=0.056..0.857 rows=21 loops=1)
        Join Filter: (b_1.blocker_id = p.user_id)
        Buffers: shared hit=1107
        ->  Nested Loop Anti Join (actual time=0.046..0.840 rows=21 loops=1)
              Buffers: shared hit=1106
              ->  Nested Loop (actual time=0.043..0.814 rows=21 loops=1)
                    Buffers: shared hit=1085
                    ->  Nested Loop (actual time=0.039..0.652 rows=25 loops=1)
                          Buffers: shared hit=1010
                          ->  Nested Loop (actual time=0.034..0.598 rows=25 loops=1)
                                Buffers: shared hit=935
                                ->  Index Scan using profiles_name_order_idx on profiles p (actual time=0.027..0.535 rows=25 loops=1)
                                      Filter: (mentorship_available AND (user_id <> '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid) AND (location ~~* '%bengaluru%'::text))
                                      Rows Removed by Filter: 826
                                      Buffers: shared hit=860
                                ->  Index Scan using users_pkey on users u (actual time=0.002..0.002 rows=1 loops=25)
                                      Index Cond: (id = p.user_id)
                                      Filter: (status = 'active'::text)
                                      Buffers: shared hit=75
                          ->  Index Scan using affiliation_claims_user_id_key on affiliation_claims ac (actual time=0.002..0.002 rows=1 loops=25)
                                Index Cond: (user_id = u.id)
                                Buffers: shared hit=75
                    ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.006..0.006 rows=1 loops=25)
                          Index Cond: (claim_id = ac.id)
                          Filter: (state = 'verified'::text)
                          Rows Removed by Filter: 0
                          Buffers: shared hit=75
              ->  Index Only Scan using blocks_pkey on blocks b (actual time=0.001..0.001 rows=0 loops=21)
                    Index Cond: ((blocker_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid) AND (blocked_id = p.user_id))
                    Heap Fetches: 0
                    Buffers: shared hit=21
        ->  Materialize (actual time=0.000..0.000 rows=0 loops=21)
              Buffers: shared hit=1
              ->  Seq Scan on blocks b_1 (actual time=0.007..0.008 rows=0 loops=1)
                    Filter: (blocked_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid)
                    Rows Removed by Filter: 50
                    Buffers: shared hit=1
Planning:
  Buffers: shared hit=65
Planning Time: 2.081 ms
Execution Time: 0.903 ms
```

### text: one word

```
Limit (actual time=19.434..19.443 rows=21 loops=1)
  Buffers: shared hit=16900
  ->  Sort (actual time=19.434..19.440 rows=21 loops=1)
        Sort Key: (round(((ts_rank(p.search_vector, '''engin'':*'::tsquery) + similarity(p.display_name, 'engineer'::text)))::numeric, 6)) DESC, p.user_id
        Sort Method: top-N heapsort  Memory: 33kB
        Buffers: shared hit=16900
        ->  Nested Loop Anti Join (actual time=2.880..18.336 rows=2572 loops=1)
              Join Filter: (b_1.blocker_id = p.user_id)
              Buffers: shared hit=16900
              ->  Nested Loop (actual time=2.859..13.399 rows=2572 loops=1)
                    Join Filter: (u.id = p.user_id)
                    Buffers: shared hit=16899
                    ->  Nested Loop (actual time=2.852..10.024 rows=2572 loops=1)
                          Buffers: shared hit=9183
                          ->  Hash Anti Join (actual time=2.840..6.205 rows=2850 loops=1)
                                Hash Cond: (p.user_id = b.blocked_id)
                                Buffers: shared hit=633
                                ->  Hash Join (actual time=2.814..5.731 rows=2863 loops=1)
                                      Hash Cond: (ac.user_id = p.user_id)
                                      Buffers: shared hit=632
                                      ->  Seq Scan on affiliation_claims ac (actual time=0.004..0.643 rows=10000 loops=1)
                                            Buffers: shared hit=141
                                      ->  Hash (actual time=2.801..2.803 rows=2863 loops=1)
                                            Buckets: 4096 (originally 1024)  Batches: 1 (originally 1)  Memory Usage: 898kB
                                            Buffers: shared hit=491
                                            ->  Bitmap Heap Scan on profiles p (actual time=0.459..1.805 rows=2863 loops=1)
                                                  Recheck Cond: ((search_vector @@ '''engin'':*'::tsquery) OR (display_name % 'engineer'::text))
                                                  Filter: ((user_id <> '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid) AND (discoverability = 'verified_members'::text))
                                                  Rows Removed by Filter: 142
                                                  Heap Blocks: exact=468
                                                  Buffers: shared hit=491
                                                  ->  BitmapOr (actual time=0.408..0.409 rows=0 loops=1)
                                                        Buffers: shared hit=23
                                                        ->  Bitmap Index Scan on profiles_search_idx (actual time=0.372..0.372 rows=3005 loops=1)
                                                              Index Cond: (search_vector @@ '''engin'':*'::tsquery)
                                                              Buffers: shared hit=4
                                                        ->  Bitmap Index Scan on profiles_name_trgm_idx (actual time=0.035..0.036 rows=0 loops=1)
                                                              Index Cond: (display_name % 'engineer'::text)
                                                              Buffers: shared hit=19
                                ->  Hash (actual time=0.020..0.020 rows=50 loops=1)
                                      Buckets: 1024  Batches: 1  Memory Usage: 11kB
                                      Buffers: shared hit=1
                                      ->  Seq Scan on blocks b (actual time=0.006..0.012 rows=50 loops=1)
                                            Filter: (blocker_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid)
                                            Buffers: shared hit=1
                          ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.001..0.001 rows=1 loops=2850)
                                Index Cond: (claim_id = ac.id)
                                Filter: (state = 'verified'::text)
                                Rows Removed by Filter: 0
                                Buffers: shared hit=8550
                    ->  Index Scan using users_pkey on users u (actual time=0.001..0.001 rows=1 loops=2572)
                          Index Cond: (id = ac.user_id)
                          Filter: (status = 'active'::text)
                          Buffers: shared hit=7716
              ->  Materialize (actual time=0.000..0.000 rows=0 loops=2572)
                    Buffers: shared hit=1
                    ->  Seq Scan on blocks b_1 (actual time=0.003..0.003 rows=0 loops=1)
                          Filter: (blocked_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid)
                          Rows Removed by Filter: 50
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=66
Planning Time: 2.087 ms
Execution Time: 19.520 ms
```

### text: name prefix

```
Limit (actual time=22.758..22.767 rows=21 loops=1)
  Buffers: shared hit=3532
  ->  Sort (actual time=22.757..22.763 rows=21 loops=1)
        Sort Key: (round(((ts_rank(p.search_vector, '''priya'':*'::tsquery) + similarity(p.display_name, 'priya'::text)))::numeric, 6)) DESC, p.user_id
        Sort Method: top-N heapsort  Memory: 33kB
        Buffers: shared hit=3532
        ->  Nested Loop Anti Join (actual time=16.886..22.420 rows=397 loops=1)
              Join Filter: (b_1.blocker_id = p.user_id)
              Buffers: shared hit=3532
              ->  Nested Loop (actual time=16.865..21.420 rows=397 loops=1)
                    Join Filter: (u.id = p.user_id)
                    Buffers: shared hit=3531
                    ->  Nested Loop (actual time=16.857..20.391 rows=397 loops=1)
                          Buffers: shared hit=2340
                          ->  Hash Anti Join (actual time=16.816..19.249 rows=464 loops=1)
                                Hash Cond: (p.user_id = b.blocked_id)
                                Buffers: shared hit=948
                                ->  Hash Join (actual time=16.786..19.077 rows=464 loops=1)
                                      Hash Cond: (ac.user_id = p.user_id)
                                      Buffers: shared hit=947
                                      ->  Seq Scan on affiliation_claims ac (actual time=0.009..0.737 rows=10000 loops=1)
                                            Buffers: shared hit=141
                                      ->  Hash (actual time=16.762..16.763 rows=464 loops=1)
                                            Buckets: 1024  Batches: 1  Memory Usage: 142kB
                                            Buffers: shared hit=806
                                            ->  Seq Scan on profiles p (actual time=0.381..16.516 rows=464 loops=1)
                                                  Filter: ((user_id <> '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid) AND (discoverability = 'verified_members'::text) AND ((search_vector @@ '''priya'':*'::tsquery) OR (display_name % 'priya'::text)))
                                                  Rows Removed by Filter: 9536
                                                  Buffers: shared hit=806
                                ->  Hash (actual time=0.021..0.021 rows=50 loops=1)
                                      Buckets: 1024  Batches: 1  Memory Usage: 11kB
                                      Buffers: shared hit=1
                                      ->  Seq Scan on blocks b (actual time=0.007..0.013 rows=50 loops=1)
                                            Filter: (blocker_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid)
                                            Buffers: shared hit=1
                          ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.002..0.002 rows=1 loops=464)
                                Index Cond: (claim_id = ac.id)
                                Filter: (state = 'verified'::text)
                                Rows Removed by Filter: 0
                                Buffers: shared hit=1392
                    ->  Index Scan using users_pkey on users u (actual time=0.002..0.002 rows=1 loops=397)
                          Index Cond: (id = ac.user_id)
                          Filter: (status = 'active'::text)
                          Buffers: shared hit=1191
              ->  Materialize (actual time=0.000..0.000 rows=0 loops=397)
                    Buffers: shared hit=1
                    ->  Seq Scan on blocks b_1 (actual time=0.004..0.005 rows=0 loops=1)
                          Filter: (blocked_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid)
                          Rows Removed by Filter: 50
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=66
Planning Time: 2.178 ms
Execution Time: 22.838 ms
```

### text: name with typo

```
Limit (actual time=26.377..26.385 rows=21 loops=1)
  Buffers: shared hit=3721
  ->  Sort (actual time=26.376..26.382 rows=21 loops=1)
        Sort Key: (round(((ts_rank(p.search_vector, '''ananya'':* & ''iyerr'':*'::tsquery) + similarity(p.display_name, 'Ananya Iyerr'::text)))::numeric, 6)) DESC, p.user_id
        Sort Method: top-N heapsort  Memory: 32kB
        Buffers: shared hit=3721
        ->  Nested Loop Anti Join (actual time=21.324..26.144 rows=438 loops=1)
              Join Filter: (b_1.blocker_id = p.user_id)
              Buffers: shared hit=3721
              ->  Nested Loop (actual time=21.300..25.108 rows=438 loops=1)
                    Join Filter: (u.id = p.user_id)
                    Buffers: shared hit=3720
                    ->  Nested Loop (actual time=21.291..24.285 rows=438 loops=1)
                          Buffers: shared hit=2406
                          ->  Hash Anti Join (actual time=21.274..23.400 rows=486 loops=1)
                                Hash Cond: (p.user_id = b.blocked_id)
                                Buffers: shared hit=948
                                ->  Hash Join (actual time=21.249..23.205 rows=490 loops=1)
                                      Hash Cond: (ac.user_id = p.user_id)
                                      Buffers: shared hit=947
                                      ->  Seq Scan on affiliation_claims ac (actual time=0.006..0.635 rows=10000 loops=1)
                                            Buffers: shared hit=141
                                      ->  Hash (actual time=21.232..21.233 rows=490 loops=1)
                                            Buckets: 1024  Batches: 1  Memory Usage: 150kB
                                            Buffers: shared hit=806
                                            ->  Seq Scan on profiles p (actual time=0.262..21.041 rows=490 loops=1)
                                                  Filter: ((user_id <> '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid) AND (discoverability = 'verified_members'::text) AND ((search_vector @@ '''ananya'':* & ''iyerr'':*'::tsquery) OR (display_name % 'Ananya Iyerr'::text)))
                                                  Rows Removed by Filter: 9510
                                                  Buffers: shared hit=806
                                ->  Hash (actual time=0.016..0.017 rows=50 loops=1)
                                      Buckets: 1024  Batches: 1  Memory Usage: 11kB
                                      Buffers: shared hit=1
                                      ->  Seq Scan on blocks b (actual time=0.006..0.011 rows=50 loops=1)
                                            Filter: (blocker_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid)
                                            Buffers: shared hit=1
                          ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.002..0.002 rows=1 loops=486)
                                Index Cond: (claim_id = ac.id)
                                Filter: (state = 'verified'::text)
                                Rows Removed by Filter: 0
                                Buffers: shared hit=1458
                    ->  Index Scan using users_pkey on users u (actual time=0.002..0.002 rows=1 loops=438)
                          Index Cond: (id = ac.user_id)
                          Filter: (status = 'active'::text)
                          Buffers: shared hit=1314
              ->  Materialize (actual time=0.000..0.000 rows=0 loops=438)
                    Buffers: shared hit=1
                    ->  Seq Scan on blocks b_1 (actual time=0.004..0.004 rows=0 loops=1)
                          Filter: (blocked_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid)
                          Rows Removed by Filter: 50
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=66
Planning Time: 2.195 ms
Execution Time: 26.514 ms
```

### text + filters

```
Limit (actual time=4.130..4.136 rows=21 loops=1)
  Buffers: shared hit=2562
  ->  Sort (actual time=4.129..4.133 rows=21 loops=1)
        Sort Key: (round(((ts_rank(p.search_vector, '''data'':*'::tsquery) + similarity(p.display_name, 'data'::text)))::numeric, 6)) DESC, p.user_id
        Sort Method: top-N heapsort  Memory: 33kB
        Buffers: shared hit=2562
        ->  Nested Loop Anti Join (actual time=0.469..4.095 rows=52 loops=1)
              Join Filter: (b_1.blocker_id = p.user_id)
              Buffers: shared hit=2562
              ->  Nested Loop Anti Join (actual time=0.455..3.978 rows=52 loops=1)
                    Buffers: shared hit=2561
                    ->  Nested Loop (actual time=0.450..3.936 rows=52 loops=1)
                          Buffers: shared hit=2509
                          ->  Nested Loop (actual time=0.446..3.813 rows=57 loops=1)
                                Buffers: shared hit=2338
                                ->  Hash Join (actual time=0.383..2.100 rows=687 loops=1)
                                      Hash Cond: (u.id = ac.user_id)
                                      Buffers: shared hit=277
                                      ->  Seq Scan on users u (actual time=0.007..0.863 rows=10000 loops=1)
                                            Filter: (status = 'active'::text)
                                            Buffers: shared hit=133
                                      ->  Hash (actual time=0.371..0.372 rows=687 loops=1)
                                            Buckets: 1024  Batches: 1  Memory Usage: 70kB
                                            Buffers: shared hit=144
                                            ->  Bitmap Heap Scan on affiliation_claims ac (actual time=0.054..0.250 rows=687 loops=1)
                                                  Recheck Cond: (lower(department) = 'computer science'::text)
                                                  Filter: (role = 'alumni'::text)
                                                  Rows Removed by Filter: 333
                                                  Heap Blocks: exact=140
                                                  Buffers: shared hit=144
                                                  ->  Bitmap Index Scan on affiliation_claims_dept_year_idx (actual time=0.039..0.039 rows=1020 loops=1)
                                                        Index Cond: (lower(department) = 'computer science'::text)
                                                        Buffers: shared hit=4
                                ->  Index Scan using profiles_pkey on profiles p (actual time=0.002..0.002 rows=0 loops=687)
                                      Index Cond: (user_id = u.id)
                                      Filter: ((user_id <> '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid) AND (discoverability = 'verified_members'::text) AND ((search_vector @@ '''data'':*'::tsquery) OR (display_name % 'data'::text)))
                                      Rows Removed by Filter: 1
                                      Buffers: shared hit=2061
                          ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.002..0.002 rows=1 loops=57)
                                Index Cond: (claim_id = ac.id)
                                Filter: (state = 'verified'::text)
                                Rows Removed by Filter: 0
                                Buffers: shared hit=171
                    ->  Index Only Scan using blocks_pkey on blocks b (actual time=0.000..0.000 rows=0 loops=52)
                          Index Cond: ((blocker_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid) AND (blocked_id = p.user_id))
                          Heap Fetches: 0
                          Buffers: shared hit=52
              ->  Materialize (actual time=0.000..0.000 rows=0 loops=52)
                    Buffers: shared hit=1
                    ->  Seq Scan on blocks b_1 (actual time=0.004..0.004 rows=0 loops=1)
                          Filter: (blocked_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid)
                          Rows Removed by Filter: 50
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=66
Planning Time: 1.458 ms
Execution Time: 4.188 ms
```

### browse page 5 (cursor)

```
Limit (actual time=0.051..0.264 rows=21 loops=1)
  Buffers: shared hit=262
  ->  Nested Loop (actual time=0.050..0.260 rows=21 loops=1)
        Buffers: shared hit=262
        ->  Nested Loop Anti Join (actual time=0.044..0.208 rows=21 loops=1)
              Join Filter: (b_1.blocker_id = p.user_id)
              Buffers: shared hit=199
              ->  Nested Loop Anti Join (actual time=0.034..0.191 rows=21 loops=1)
                    Buffers: shared hit=198
                    ->  Nested Loop (actual time=0.030..0.165 rows=21 loops=1)
                          Buffers: shared hit=177
                          ->  Nested Loop (actual time=0.025..0.102 rows=25 loops=1)
                                Buffers: shared hit=102
                                ->  Index Scan using profiles_name_order_idx on profiles p (actual time=0.018..0.039 rows=25 loops=1)
                                      Index Cond: (ROW(display_name, user_id) > ROW('Aditya Iyer'::text, 'e62b8c76-7a13-4004-90e7-14036ad751dd'::uuid))
                                      Filter: (user_id <> '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid)
                                      Buffers: shared hit=27
                                ->  Index Scan using affiliation_claims_user_id_key on affiliation_claims ac (actual time=0.002..0.002 rows=1 loops=25)
                                      Index Cond: (user_id = p.user_id)
                                      Buffers: shared hit=75
                          ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.002..0.002 rows=1 loops=25)
                                Index Cond: (claim_id = ac.id)
                                Filter: (state = 'verified'::text)
                                Rows Removed by Filter: 0
                                Buffers: shared hit=75
                    ->  Index Only Scan using blocks_pkey on blocks b (actual time=0.001..0.001 rows=0 loops=21)
                          Index Cond: ((blocker_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid) AND (blocked_id = p.user_id))
                          Heap Fetches: 0
                          Buffers: shared hit=21
              ->  Materialize (actual time=0.001..0.001 rows=0 loops=21)
                    Buffers: shared hit=1
                    ->  Seq Scan on blocks b_1 (actual time=0.008..0.008 rows=0 loops=1)
                          Filter: (blocked_id = '0007e317-bc22-4dd0-929b-2f062d95c76f'::uuid)
                          Rows Removed by Filter: 50
                          Buffers: shared hit=1
        ->  Index Scan using users_pkey on users u (actual time=0.002..0.002 rows=1 loops=21)
              Index Cond: (id = p.user_id)
              Filter: (status = 'active'::text)
              Buffers: shared hit=63
Planning:
  Buffers: shared hit=64
Planning Time: 2.418 ms
Execution Time: 0.316 ms
```

</details>

## 100,000 profiles (seeded in 21.5 s)

| query | results | p50 ms | p95 ms | p99 ms |
|---|---:|---:|---:|---:|
| browse (no filters) | 20 | 4.37 | 5.32 | 5.99 |
| department + year range | 20 | 8.87 | 11.30 | 13.53 |
| skill filter | 20 | 9.96 | 13.84 | 17.75 |
| company substring | 20 | 4.70 | 5.86 | 6.88 |
| mentors in a city | 20 | 4.25 | 5.60 | 5.98 |
| text: one word | 20 | 139.50 | 163.47 | 181.09 |
| text: name prefix | 20 | 76.92 | 92.86 | 100.27 |
| text: name with typo | 20 | 94.21 | 113.88 | 130.50 |
| text + filters | 20 | 55.07 | 66.27 | 69.71 |
| browse page 5 (cursor) | 20 | 4.07 | 5.43 | 6.20 |

<details><summary>Query plans (100,000 profiles)</summary>

### browse (no filters)

```
Limit (actual time=0.067..0.249 rows=21 loops=1)
  Buffers: shared hit=325
  ->  Nested Loop (actual time=0.066..0.246 rows=21 loops=1)
        Buffers: shared hit=325
        ->  Nested Loop Anti Join (actual time=0.060..0.200 rows=21 loops=1)
              Join Filter: (b_1.blocker_id = p.user_id)
              Buffers: shared hit=241
              ->  Nested Loop Anti Join (actual time=0.051..0.186 rows=21 loops=1)
                    Buffers: shared hit=240
                    ->  Nested Loop (actual time=0.047..0.168 rows=21 loops=1)
                          Buffers: shared hit=219
                          ->  Nested Loop (actual time=0.040..0.105 rows=24 loops=1)
                                Buffers: shared hit=123
                                ->  Index Scan using profiles_name_order_idx on profiles p (actual time=0.031..0.048 rows=24 loops=1)
                                      Filter: (user_id <> '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                                      Buffers: shared hit=27
                                ->  Index Scan using affiliation_claims_user_id_key on affiliation_claims ac (actual time=0.002..0.002 rows=1 loops=24)
                                      Index Cond: (user_id = p.user_id)
                                      Buffers: shared hit=96
                          ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.002..0.002 rows=1 loops=24)
                                Index Cond: (claim_id = ac.id)
                                Filter: (state = 'verified'::text)
                                Rows Removed by Filter: 0
                                Buffers: shared hit=96
                    ->  Index Only Scan using blocks_pkey on blocks b (actual time=0.001..0.001 rows=0 loops=21)
                          Index Cond: ((blocker_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid) AND (blocked_id = p.user_id))
                          Heap Fetches: 0
                          Buffers: shared hit=21
              ->  Materialize (actual time=0.000..0.000 rows=0 loops=21)
                    Buffers: shared hit=1
                    ->  Seq Scan on blocks b_1 (actual time=0.008..0.008 rows=0 loops=1)
                          Filter: (blocked_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                          Rows Removed by Filter: 50
                          Buffers: shared hit=1
        ->  Index Scan using users_pkey on users u (actual time=0.002..0.002 rows=1 loops=21)
              Index Cond: (id = p.user_id)
              Filter: (status = 'active'::text)
              Buffers: shared hit=84
Planning:
  Buffers: shared hit=84
Planning Time: 2.484 ms
Execution Time: 0.294 ms
```

### department + year range

```
Limit (actual time=0.252..4.720 rows=21 loops=1)
  Buffers: shared hit=9511
  ->  Nested Loop Anti Join (actual time=0.251..4.716 rows=21 loops=1)
        Join Filter: (b_1.blocker_id = p.user_id)
        Buffers: shared hit=9511
        ->  Nested Loop (actual time=0.247..4.704 rows=21 loops=1)
              Buffers: shared hit=9510
              ->  Nested Loop Anti Join (actual time=0.242..4.647 rows=21 loops=1)
                    Join Filter: (b.blocked_id = p.user_id)
                    Rows Removed by Join Filter: 1050
                    Buffers: shared hit=9426
                    ->  Nested Loop (actual time=0.220..4.518 rows=21 loops=1)
                          Buffers: shared hit=9425
                          ->  Nested Loop (actual time=0.101..4.454 rows=23 loops=1)
                                Buffers: shared hit=9333
                                ->  Index Scan using profiles_name_order_idx on profiles p (actual time=0.009..1.012 rows=1863 loops=1)
                                      Filter: (user_id <> '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                                      Buffers: shared hit=1881
                                ->  Index Scan using affiliation_claims_user_id_key on affiliation_claims ac (actual time=0.002..0.002 rows=0 loops=1863)
                                      Index Cond: (user_id = p.user_id)
                                      Filter: ((graduation_year >= 2010) AND (graduation_year <= 2015) AND (lower(department) = 'computer science'::text))
                                      Rows Removed by Filter: 1
                                      Buffers: shared hit=7452
                          ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.002..0.002 rows=1 loops=23)
                                Index Cond: (claim_id = ac.id)
                                Filter: (state = 'verified'::text)
                                Rows Removed by Filter: 0
                                Buffers: shared hit=92
                    ->  Materialize (actual time=0.000..0.003 rows=50 loops=21)
                          Buffers: shared hit=1
                          ->  Seq Scan on blocks b (actual time=0.004..0.008 rows=50 loops=1)
                                Filter: (blocker_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                                Buffers: shared hit=1
              ->  Index Scan using users_pkey on users u (actual time=0.002..0.002 rows=1 loops=21)
                    Index Cond: (id = p.user_id)
                    Filter: (status = 'active'::text)
                    Buffers: shared hit=84
        ->  Materialize (actual time=0.000..0.000 rows=0 loops=21)
              Buffers: shared hit=1
              ->  Seq Scan on blocks b_1 (actual time=0.003..0.003 rows=0 loops=1)
                    Filter: (blocked_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                    Rows Removed by Filter: 50
                    Buffers: shared hit=1
Planning:
  Buffers: shared hit=84
Planning Time: 2.037 ms
Execution Time: 4.766 ms
```

### skill filter

```
Limit (actual time=0.066..0.526 rows=21 loops=1)
  Buffers: shared hit=722
  ->  Nested Loop Anti Join (actual time=0.065..0.523 rows=21 loops=1)
        Join Filter: (b_1.blocker_id = p.user_id)
        Buffers: shared hit=722
        ->  Nested Loop (actual time=0.055..0.508 rows=21 loops=1)
              Buffers: shared hit=721
              ->  Nested Loop Anti Join (actual time=0.051..0.459 rows=21 loops=1)
                    Buffers: shared hit=637
                    ->  Nested Loop (actual time=0.048..0.443 rows=21 loops=1)
                          Buffers: shared hit=616
                          ->  Nested Loop (actual time=0.042..0.385 rows=22 loops=1)
                                Buffers: shared hit=528
                                ->  Nested Loop (actual time=0.036..0.329 rows=22 loops=1)
                                      Buffers: shared hit=440
                                      ->  Index Scan using profiles_name_order_idx on profiles p (actual time=0.013..0.085 rows=109 loops=1)
                                            Filter: (user_id <> '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                                            Buffers: shared hit=112
                                      ->  Index Only Scan using profile_skills_pkey on profile_skills s (actual time=0.002..0.002 rows=0 loops=109)
                                            Index Cond: ((user_id = p.user_id) AND (skill = 'kubernetes'::text))
                                            Heap Fetches: 0
                                            Buffers: shared hit=328
                                ->  Index Scan using affiliation_claims_user_id_key on affiliation_claims ac (actual time=0.002..0.002 rows=1 loops=22)
                                      Index Cond: (user_id = p.user_id)
                                      Buffers: shared hit=88
                          ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.002..0.002 rows=1 loops=22)
                                Index Cond: (claim_id = ac.id)
                                Filter: (state = 'verified'::text)
                                Rows Removed by Filter: 0
                                Buffers: shared hit=88
                    ->  Index Only Scan using blocks_pkey on blocks b (actual time=0.000..0.000 rows=0 loops=21)
                          Index Cond: ((blocker_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid) AND (blocked_id = p.user_id))
                          Heap Fetches: 0
                          Buffers: shared hit=21
              ->  Index Scan using users_pkey on users u (actual time=0.002..0.002 rows=1 loops=21)
                    Index Cond: (id = p.user_id)
                    Filter: (status = 'active'::text)
                    Buffers: shared hit=84
        ->  Materialize (actual time=0.000..0.000 rows=0 loops=21)
              Buffers: shared hit=1
              ->  Seq Scan on blocks b_1 (actual time=0.008..0.008 rows=0 loops=1)
                    Filter: (blocked_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                    Rows Removed by Filter: 50
                    Buffers: shared hit=1
Planning:
  Buffers: shared hit=132
Planning Time: 7.523 ms
Execution Time: 0.572 ms
```

### company substring

```
Limit (actual time=0.057..0.660 rows=21 loops=1)
  Buffers: shared hit=827
  ->  Nested Loop Anti Join (actual time=0.056..0.657 rows=21 loops=1)
        Join Filter: (b_1.blocker_id = p.user_id)
        Buffers: shared hit=827
        ->  Nested Loop (actual time=0.048..0.644 rows=21 loops=1)
              Join Filter: (u.id = p.user_id)
              Buffers: shared hit=826
              ->  Nested Loop Anti Join (actual time=0.043..0.596 rows=21 loops=1)
                    Buffers: shared hit=742
                    ->  Nested Loop (actual time=0.040..0.578 rows=21 loops=1)
                          Buffers: shared hit=721
                          ->  Nested Loop (actual time=0.035..0.526 rows=21 loops=1)
                                Buffers: shared hit=637
                                ->  Index Scan using profiles_name_order_idx on profiles p (actual time=0.027..0.469 rows=21 loops=1)
                                      Filter: ((user_id <> '0000308d-b02a-42dc-b027-1642d9d28575'::uuid) AND (current_company ~~* '%micro%'::text))
                                      Rows Removed by Filter: 525
                                      Buffers: shared hit=553
                                ->  Index Scan using affiliation_claims_user_id_key on affiliation_claims ac (actual time=0.002..0.002 rows=1 loops=21)
                                      Index Cond: (user_id = p.user_id)
                                      Buffers: shared hit=84
                          ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.002..0.002 rows=1 loops=21)
                                Index Cond: (claim_id = ac.id)
                                Filter: (state = 'verified'::text)
                                Buffers: shared hit=84
                    ->  Index Only Scan using blocks_pkey on blocks b (actual time=0.001..0.001 rows=0 loops=21)
                          Index Cond: ((blocker_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid) AND (blocked_id = p.user_id))
                          Heap Fetches: 0
                          Buffers: shared hit=21
              ->  Index Scan using users_pkey on users u (actual time=0.002..0.002 rows=1 loops=21)
                    Index Cond: (id = ac.user_id)
                    Filter: (status = 'active'::text)
                    Buffers: shared hit=84
        ->  Materialize (actual time=0.000..0.000 rows=0 loops=21)
              Buffers: shared hit=1
              ->  Seq Scan on blocks b_1 (actual time=0.007..0.007 rows=0 loops=1)
                    Filter: (blocked_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                    Rows Removed by Filter: 50
                    Buffers: shared hit=1
Planning:
  Buffers: shared hit=85
Planning Time: 2.674 ms
Execution Time: 0.706 ms
```

### mentors in a city

```
Limit (actual time=0.096..0.631 rows=21 loops=1)
  Buffers: shared hit=839
  ->  Nested Loop Anti Join (actual time=0.096..0.628 rows=21 loops=1)
        Join Filter: (b_1.blocker_id = p.user_id)
        Buffers: shared hit=839
        ->  Nested Loop Anti Join (actual time=0.083..0.610 rows=21 loops=1)
              Buffers: shared hit=838
              ->  Nested Loop (actual time=0.078..0.591 rows=21 loops=1)
                    Buffers: shared hit=817
                    ->  Nested Loop (actual time=0.072..0.529 rows=24 loops=1)
                          Buffers: shared hit=721
                          ->  Nested Loop (actual time=0.066..0.466 rows=24 loops=1)
                                Buffers: shared hit=625
                                ->  Index Scan using profiles_name_order_idx on profiles p (actual time=0.055..0.399 rows=24 loops=1)
                                      Filter: (mentorship_available AND (user_id <> '0000308d-b02a-42dc-b027-1642d9d28575'::uuid) AND (location ~~* '%bengaluru%'::text))
                                      Rows Removed by Filter: 498
                                      Buffers: shared hit=529
                                ->  Index Scan using users_pkey on users u (actual time=0.002..0.002 rows=1 loops=24)
                                      Index Cond: (id = p.user_id)
                                      Filter: (status = 'active'::text)
                                      Buffers: shared hit=96
                          ->  Index Scan using affiliation_claims_user_id_key on affiliation_claims ac (actual time=0.002..0.002 rows=1 loops=24)
                                Index Cond: (user_id = u.id)
                                Buffers: shared hit=96
                    ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.002..0.002 rows=1 loops=24)
                          Index Cond: (claim_id = ac.id)
                          Filter: (state = 'verified'::text)
                          Rows Removed by Filter: 0
                          Buffers: shared hit=96
              ->  Index Only Scan using blocks_pkey on blocks b (actual time=0.001..0.001 rows=0 loops=21)
                    Index Cond: ((blocker_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid) AND (blocked_id = p.user_id))
                    Heap Fetches: 0
                    Buffers: shared hit=21
        ->  Materialize (actual time=0.001..0.001 rows=0 loops=21)
              Buffers: shared hit=1
              ->  Seq Scan on blocks b_1 (actual time=0.010..0.010 rows=0 loops=1)
                    Filter: (blocked_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                    Rows Removed by Filter: 50
                    Buffers: shared hit=1
Planning:
  Buffers: shared hit=85
Planning Time: 2.401 ms
Execution Time: 0.692 ms
```

### text: one word

```
Limit (actual time=138.589..145.367 rows=21 loops=1)
  Buffers: shared hit=4993, temp read=1052 written=1256
  ->  Nested Loop Anti Join (actual time=138.587..145.361 rows=21 loops=1)
        Join Filter: (b_1.blocker_id = p.user_id)
        Buffers: shared hit=4993, temp read=1052 written=1256
        ->  Nested Loop (actual time=138.541..145.247 rows=21 loops=1)
              Buffers: shared hit=4992, temp read=1052 written=1256
              ->  Nested Loop (actual time=138.493..145.101 rows=23 loops=1)
                    Buffers: shared hit=4900, temp read=1052 written=1256
                    ->  Nested Loop (actual time=138.472..144.955 rows=23 loops=1)
                          Buffers: shared hit=4808, temp read=1052 written=1256
                          ->  Gather Merge (actual time=138.420..144.783 rows=23 loops=1)
                                Workers Planned: 1
                                Workers Launched: 1
                                Buffers: shared hit=4716, temp read=1052 written=1256
                                ->  Sort (actual time=98.987..99.009 rows=114 loops=2)
                                      Sort Key: (round(((ts_rank(p.search_vector, '''engin'':*'::tsquery) + similarity(p.display_name, 'engineer'::text)))::numeric, 6)) DESC, p.user_id
                                      Sort Method: external merge  Disk: 5072kB
                                      Buffers: shared hit=4716, temp read=1052 written=1256
                                      Worker 0:  Sort Method: quicksort  Memory: 3651kB
                                      ->  Merge Anti Join (actual time=23.523..60.803 rows=14339 loops=2)
                                            Merge Cond: (p.user_id = b.blocked_id)
                                            Buffers: shared hit=4705, temp read=620 written=621
                                            ->  Sort (actual time=23.430..26.150 rows=14346 loops=2)
                                                  Sort Key: p.user_id
                                                  Sort Method: external merge  Disk: 4960kB
                                                  Buffers: shared hit=4703, temp read=620 written=621
                                                  Worker 0:  Sort Method: quicksort  Memory: 3574kB
                                                  ->  Parallel Bitmap Heap Scan on profiles p (actual time=3.472..13.334 rows=14346 loops=2)
                                                        Recheck Cond: ((search_vector @@ '''engin'':*'::tsquery) OR (display_name % 'engineer'::text))
                                                        Filter: ((user_id <> '0000308d-b02a-42dc-b027-1642d9d28575'::uuid) AND (discoverability = 'verified_members'::text))
                                                        Rows Removed by Filter: 785
                                                        Heap Blocks: exact=2874
                                                        Buffers: shared hit=4703
                                                        ->  BitmapOr (actual time=6.122..6.125 rows=0 loops=1)
                                                              Buffers: shared hit=39
                                                              ->  Bitmap Index Scan on profiles_search_idx (actual time=5.081..5.081 rows=30262 loops=1)
                                                                    Index Cond: (search_vector @@ '''engin'':*'::tsquery)
                                                                    Buffers: shared hit=11
                                                              ->  Bitmap Index Scan on profiles_name_trgm_idx (actual time=1.040..1.040 rows=0 loops=1)
                                                                    Index Cond: (display_name % 'engineer'::text)
                                                                    Buffers: shared hit=28
                                            ->  Sort (actual time=0.045..0.050 rows=46 loops=2)
                                                  Sort Key: b.blocked_id
                                                  Sort Method: quicksort  Memory: 26kB
                                                  Buffers: shared hit=2
                                                  Worker 0:  Sort Method: quicksort  Memory: 26kB
                                                  ->  Seq Scan on blocks b (actual time=0.022..0.028 rows=50 loops=2)
                                                        Filter: (blocker_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                                                        Buffers: shared hit=2
                          ->  Index Scan using users_pkey on users u (actual time=0.006..0.006 rows=1 loops=23)
                                Index Cond: (id = p.user_id)
                                Filter: (status = 'active'::text)
                                Buffers: shared hit=92
                    ->  Index Scan using affiliation_claims_user_id_key on affiliation_claims ac (actual time=0.006..0.006 rows=1 loops=23)
                          Index Cond: (user_id = u.id)
                          Buffers: shared hit=92
              ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.006..0.006 rows=1 loops=23)
                    Index Cond: (claim_id = ac.id)
                    Filter: (state = 'verified'::text)
                    Rows Removed by Filter: 0
                    Buffers: shared hit=92
        ->  Materialize (actual time=0.001..0.001 rows=0 loops=21)
              Buffers: shared hit=1
              ->  Seq Scan on blocks b_1 (actual time=0.016..0.016 rows=0 loops=1)
                    Filter: (blocked_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                    Rows Removed by Filter: 50
                    Buffers: shared hit=1
Planning:
  Buffers: shared hit=86
Planning Time: 3.081 ms
Execution Time: 147.190 ms
```

### text: name prefix

```
Limit (actual time=66.358..71.033 rows=21 loops=1)
  Buffers: shared hit=8473
  ->  Nested Loop Anti Join (actual time=66.356..71.028 rows=21 loops=1)
        Join Filter: (b_1.blocker_id = p.user_id)
        Buffers: shared hit=8473
        ->  Nested Loop (actual time=66.326..70.963 rows=21 loops=1)
              Join Filter: (u.id = p.user_id)
              Buffers: shared hit=8472
              ->  Nested Loop (actual time=66.312..70.869 rows=21 loops=1)
                    Buffers: shared hit=8388
                    ->  Nested Loop (actual time=66.121..70.603 rows=24 loops=1)
                          Buffers: shared hit=8292
                          ->  Gather Merge (actual time=66.094..70.470 rows=24 loops=1)
                                Workers Planned: 2
                                Workers Launched: 2
                                Buffers: shared hit=8196
                                ->  Sort (actual time=53.154..53.167 rows=153 loops=3)
                                      Sort Key: (round(((ts_rank(p.search_vector, '''priya'':*'::tsquery) + similarity(p.display_name, 'priya'::text)))::numeric, 6)) DESC, p.user_id
                                      Sort Method: quicksort  Memory: 647kB
                                      Buffers: shared hit=8196
                                      Worker 0:  Sort Method: quicksort  Memory: 408kB
                                      Worker 1:  Sort Method: quicksort  Memory: 482kB
                                      ->  Hash Anti Join (actual time=0.822..49.171 rows=1584 loops=3)
                                            Hash Cond: (p.user_id = b.blocked_id)
                                            Buffers: shared hit=8110
                                            ->  Parallel Seq Scan on profiles p (actual time=0.748..46.025 rows=1585 loops=3)
                                                  Filter: ((user_id <> '0000308d-b02a-42dc-b027-1642d9d28575'::uuid) AND (discoverability = 'verified_members'::text) AND ((search_vector @@ '''priya'':*'::tsquery) OR (display_name % 'priya'::text)))
                                                  Rows Removed by Filter: 31748
                                                  Buffers: shared hit=8049
                                            ->  Hash (actual time=0.023..0.024 rows=50 loops=3)
                                                  Buckets: 1024  Batches: 1  Memory Usage: 11kB
                                                  Buffers: shared hit=3
                                                  ->  Seq Scan on blocks b (actual time=0.008..0.013 rows=50 loops=3)
                                                        Filter: (blocker_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                                                        Buffers: shared hit=3
                          ->  Index Scan using affiliation_claims_user_id_key on affiliation_claims ac (actual time=0.005..0.005 rows=1 loops=24)
                                Index Cond: (user_id = p.user_id)
                                Buffers: shared hit=96
                    ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.011..0.011 rows=1 loops=24)
                          Index Cond: (claim_id = ac.id)
                          Filter: (state = 'verified'::text)
                          Rows Removed by Filter: 0
                          Buffers: shared hit=96
              ->  Index Scan using users_pkey on users u (actual time=0.004..0.004 rows=1 loops=21)
                    Index Cond: (id = ac.user_id)
                    Filter: (status = 'active'::text)
                    Buffers: shared hit=84
        ->  Materialize (actual time=0.001..0.001 rows=0 loops=21)
              Buffers: shared hit=1
              ->  Seq Scan on blocks b_1 (actual time=0.012..0.012 rows=0 loops=1)
                    Filter: (blocked_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                    Rows Removed by Filter: 50
                    Buffers: shared hit=1
Planning:
  Buffers: shared hit=86
Planning Time: 2.324 ms
Execution Time: 71.104 ms
```

### text: name with typo

```
Limit (actual time=99.085..105.473 rows=21 loops=1)
  Buffers: shared hit=8533
  ->  Nested Loop Anti Join (actual time=99.084..105.468 rows=21 loops=1)
        Join Filter: (b_1.blocker_id = p.user_id)
        Buffers: shared hit=8533
        ->  Nested Loop (actual time=99.052..105.368 rows=21 loops=1)
              Buffers: shared hit=8532
              ->  Nested Loop (actual time=99.037..105.213 rows=28 loops=1)
                    Buffers: shared hit=8420
                    ->  Nested Loop (actual time=99.019..105.069 rows=28 loops=1)
                          Buffers: shared hit=8308
                          ->  Gather Merge (actual time=98.986..104.890 rows=28 loops=1)
                                Workers Planned: 2
                                Workers Launched: 2
                                Buffers: shared hit=8196
                                ->  Sort (actual time=84.702..84.717 rows=153 loops=3)
                                      Sort Key: (round(((ts_rank(p.search_vector, '''ananya'':* & ''iyerr'':*'::tsquery) + similarity(p.display_name, 'Ananya Iyerr'::text)))::numeric, 6)) DESC, p.user_id
                                      Sort Method: quicksort  Memory: 615kB
                                      Buffers: shared hit=8196
                                      Worker 0:  Sort Method: quicksort  Memory: 435kB
                                      Worker 1:  Sort Method: quicksort  Memory: 560kB
                                      ->  Hash Anti Join (actual time=0.924..80.842 rows=1675 loops=3)
                                            Hash Cond: (p.user_id = b.blocked_id)
                                            Buffers: shared hit=8110
                                            ->  Parallel Seq Scan on profiles p (actual time=0.823..75.461 rows=1676 loops=3)
                                                  Filter: ((user_id <> '0000308d-b02a-42dc-b027-1642d9d28575'::uuid) AND (discoverability = 'verified_members'::text) AND ((search_vector @@ '''ananya'':* & ''iyerr'':*'::tsquery) OR (display_name % 'Ananya Iyerr'::text)))
                                                  Rows Removed by Filter: 31657
                                                  Buffers: shared hit=8049
                                            ->  Hash (actual time=0.031..0.032 rows=50 loops=3)
                                                  Buckets: 1024  Batches: 1  Memory Usage: 11kB
                                                  Buffers: shared hit=3
                                                  ->  Seq Scan on blocks b (actual time=0.013..0.019 rows=50 loops=3)
                                                        Filter: (blocker_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                                                        Buffers: shared hit=3
                          ->  Index Scan using users_pkey on users u (actual time=0.006..0.006 rows=1 loops=28)
                                Index Cond: (id = p.user_id)
                                Filter: (status = 'active'::text)
                                Buffers: shared hit=112
                    ->  Index Scan using affiliation_claims_user_id_key on affiliation_claims ac (actual time=0.004..0.004 rows=1 loops=28)
                          Index Cond: (user_id = u.id)
                          Buffers: shared hit=112
              ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.005..0.005 rows=1 loops=28)
                    Index Cond: (claim_id = ac.id)
                    Filter: (state = 'verified'::text)
                    Rows Removed by Filter: 0
                    Buffers: shared hit=112
        ->  Materialize (actual time=0.001..0.001 rows=0 loops=21)
              Buffers: shared hit=1
              ->  Seq Scan on blocks b_1 (actual time=0.013..0.014 rows=0 loops=1)
                    Filter: (blocked_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                    Rows Removed by Filter: 50
                    Buffers: shared hit=1
Planning:
  Buffers: shared hit=86
Planning Time: 3.058 ms
Execution Time: 105.571 ms
```

### text + filters

```
Limit (actual time=47.059..52.624 rows=21 loops=1)
  Buffers: shared hit=29600
  ->  Nested Loop Anti Join (actual time=47.057..52.619 rows=21 loops=1)
        Join Filter: (b_1.blocker_id = p.user_id)
        Buffers: shared hit=29600
        ->  Nested Loop Anti Join (actual time=47.034..52.561 rows=21 loops=1)
              Buffers: shared hit=29599
              ->  Nested Loop (actual time=47.020..52.533 rows=21 loops=1)
                    Buffers: shared hit=29578
                    ->  Gather Merge (actual time=47.002..52.415 rows=23 loops=1)
                          Workers Planned: 1
                          Workers Launched: 1
                          Buffers: shared hit=29486
                          ->  Sort (actual time=38.526..38.540 rows=100 loops=2)
                                Sort Key: (round(((ts_rank(p.search_vector, '''data'':*'::tsquery) + similarity(p.display_name, 'data'::text)))::numeric, 6)) DESC, p.user_id
                                Sort Method: quicksort  Memory: 135kB
                                Buffers: shared hit=29486
                                Worker 0:  Sort Method: quicksort  Memory: 123kB
                                ->  Nested Loop (actual time=4.261..37.748 rows=304 loops=2)
                                      Buffers: shared hit=29472
                                      ->  Parallel Hash Join (actual time=4.116..19.534 rows=3337 loops=2)
                                            Hash Cond: (u.id = ac.user_id)
                                            Buffers: shared hit=2775
                                            ->  Parallel Seq Scan on users u (actual time=0.008..7.039 rows=50000 loops=2)
                                                  Filter: (status = 'active'::text)
                                                  Buffers: shared hit=1333
                                            ->  Parallel Hash (actual time=3.963..3.965 rows=3337 loops=2)
                                                  Buckets: 8192  Batches: 1  Memory Usage: 704kB
                                                  Buffers: shared hit=1413
                                                  ->  Parallel Bitmap Heap Scan on affiliation_claims ac (actual time=0.797..5.178 rows=6674 loops=1)
                                                        Recheck Cond: (lower(department) = 'computer science'::text)
                                                        Filter: (role = 'alumni'::text)
                                                        Rows Removed by Filter: 3431
                                                        Heap Blocks: exact=1399
                                                        Buffers: shared hit=1413
                                                        ->  Bitmap Index Scan on affiliation_claims_dept_year_idx (actual time=0.648..0.648 rows=10105 loops=1)
                                                              Index Cond: (lower(department) = 'computer science'::text)
                                                              Buffers: shared hit=14
                                      ->  Index Scan using profiles_pkey on profiles p (actual time=0.005..0.005 rows=0 loops=6674)
                                            Index Cond: (user_id = u.id)
                                            Filter: ((user_id <> '0000308d-b02a-42dc-b027-1642d9d28575'::uuid) AND (discoverability = 'verified_members'::text) AND ((search_vector @@ '''data'':*'::tsquery) OR (display_name % 'data'::text)))
                                            Rows Removed by Filter: 1
                                            Buffers: shared hit=26697
                    ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.004..0.004 rows=1 loops=23)
                          Index Cond: (claim_id = ac.id)
                          Filter: (state = 'verified'::text)
                          Rows Removed by Filter: 0
                          Buffers: shared hit=92
              ->  Index Only Scan using blocks_pkey on blocks b (actual time=0.001..0.001 rows=0 loops=21)
                    Index Cond: ((blocker_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid) AND (blocked_id = p.user_id))
                    Heap Fetches: 0
                    Buffers: shared hit=21
        ->  Materialize (actual time=0.001..0.001 rows=0 loops=21)
              Buffers: shared hit=1
              ->  Seq Scan on blocks b_1 (actual time=0.011..0.011 rows=0 loops=1)
                    Filter: (blocked_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                    Rows Removed by Filter: 50
                    Buffers: shared hit=1
Planning:
  Buffers: shared hit=86
Planning Time: 2.298 ms
Execution Time: 52.710 ms
```

### browse page 5 (cursor)

```
Limit (actual time=0.077..0.324 rows=21 loops=1)
  Buffers: shared hit=326
  ->  Nested Loop (actual time=0.076..0.321 rows=21 loops=1)
        Buffers: shared hit=326
        ->  Nested Loop Anti Join (actual time=0.063..0.250 rows=21 loops=1)
              Join Filter: (b_1.blocker_id = p.user_id)
              Buffers: shared hit=242
              ->  Nested Loop Anti Join (actual time=0.051..0.232 rows=21 loops=1)
                    Buffers: shared hit=241
                    ->  Nested Loop (actual time=0.047..0.209 rows=21 loops=1)
                          Buffers: shared hit=220
                          ->  Nested Loop (actual time=0.030..0.130 rows=24 loops=1)
                                Buffers: shared hit=124
                                ->  Index Scan using profiles_name_order_idx on profiles p (actual time=0.021..0.056 rows=24 loops=1)
                                      Index Cond: (ROW(display_name, user_id) > ROW('Aditya Das'::text, '46e9d052-9310-4a47-829a-08c204a812c8'::uuid))
                                      Filter: (user_id <> '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                                      Buffers: shared hit=28
                                ->  Index Scan using affiliation_claims_user_id_key on affiliation_claims ac (actual time=0.002..0.002 rows=1 loops=24)
                                      Index Cond: (user_id = p.user_id)
                                      Buffers: shared hit=96
                          ->  Index Scan using verification_cases_claim_id_key on verification_cases vc (actual time=0.003..0.003 rows=1 loops=24)
                                Index Cond: (claim_id = ac.id)
                                Filter: (state = 'verified'::text)
                                Rows Removed by Filter: 0
                                Buffers: shared hit=96
                    ->  Index Only Scan using blocks_pkey on blocks b (actual time=0.001..0.001 rows=0 loops=21)
                          Index Cond: ((blocker_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid) AND (blocked_id = p.user_id))
                          Heap Fetches: 0
                          Buffers: shared hit=21
              ->  Materialize (actual time=0.001..0.001 rows=0 loops=21)
                    Buffers: shared hit=1
                    ->  Seq Scan on blocks b_1 (actual time=0.009..0.009 rows=0 loops=1)
                          Filter: (blocked_id = '0000308d-b02a-42dc-b027-1642d9d28575'::uuid)
                          Rows Removed by Filter: 50
                          Buffers: shared hit=1
        ->  Index Scan using users_pkey on users u (actual time=0.003..0.003 rows=1 loops=21)
              Index Cond: (id = p.user_id)
              Filter: (status = 'active'::text)
              Buffers: shared hit=84
Planning:
  Buffers: shared hit=84
Planning Time: 3.339 ms
Execution Time: 0.394 ms
```

</details>

