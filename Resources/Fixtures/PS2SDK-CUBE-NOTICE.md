# PS2SDK Cube Demo — provenance and redistribution notice

This directory contains one narrowly authorized PlayStation 2 homebrew
**demo** used as a functional validation fixture. It is not a commercial game,
does not contain a PlayStation 2 BIOS, and does not contain Sony game code,
artwork, encryption keys, or disc data.

The fixture is distributed unchanged from the official `ps2dev/ps2sdk`
GitHub Actions artifact identified below. PS2 Emu is not affiliated with,
endorsed by, or sponsored by Sony Interactive Entertainment, the PlayStation
brand, ps2dev, or the individual contributors named in the source.

## Machine-verifiable fixture identity

| Field | Exact value |
| --- | --- |
| Repository fixture path | `Resources/Fixtures/ps2sdk-cube.elf` |
| SHA-256 | `1293781d9f661763e5e598b8c7037830462b05b53e532c298f8515b0df533584` |
| Byte size | `174772` |
| Format | 32-bit little-endian MIPS ELF, statically linked, stripped |
| Upstream repository | `https://github.com/ps2dev/ps2sdk` |
| Upstream commit | `39a89923ce59152fa855250cfacaccf8e581a1eb` |
| Upstream source | `https://github.com/ps2dev/ps2sdk/tree/39a89923ce59152fa855250cfacaccf8e581a1eb/ee/draw/samples/cube` |
| Upstream CI run | `https://github.com/ps2dev/ps2sdk/actions/runs/33232694254` |
| Artifact name | `ps2sdk-samples-all-39a89923` |
| Artifact SHA-256 digest | `b2d3c6e46a9d6348da2442b9ad76a4486d1522d2c802bc885f3afdbffa1a61f2` |
| Artifact byte size | `14793020` |
| Path inside artifact | `draw/cube/cube.elf` |

GitHub reported the CI run as successful, with head SHA
`39a89923ce59152fa855250cfacaccf8e581a1eb`. The workflow compiled the sample
with `mips64r5900el-ps2-elf-gcc`, linked the ps2sdk `draw`, `graph`, `math3d`,
`packet`, and `dma` libraries, and stripped the resulting ELF. The checked-in
fixture is byte-for-byte identical to that artifact member. PS2 Emu does not
download or replace this fixture at runtime.

## Source attribution and AFL 2.0

The Cube sample source identifies:

- Copyright `(c) 2005 Naomi Peori <naomi@peori.ca>`
- `Licensed under Academic Free License version 2.0`
- PS2DEV Open Source Project

The installed sample Makefile also identifies copyright `2001-2004, ps2dev`
and the Academic Free License version 2.0.

The unmodified upstream AFL 2.0 text is included at
`Resources/Fixtures/PS2SDK-AFL-2.0.txt`. Its exact source is:

`https://github.com/ps2dev/ps2sdk/blob/39a89923ce59152fa855250cfacaccf8e581a1eb/LICENSE`

The corresponding machine-readable source, including the Cube source and the
ps2sdk libraries linked by the official build, remains available at the exact
commit-addressed repository above. If that hosted repository ceases to be
available while PS2 Emu continues distributing the fixture, distribution must
stop until an equivalent durable source repository and updated notice are
provided.

For direct, offline inspection, the exact three source files installed into
the official sample artifact are also preserved without modification:

| Repository source path | SHA-256 | Byte size |
| --- | --- | ---: |
| `Resources/Fixtures/source/cube.c` | `fb5cc5955ffe346ede5f31d73743545d001fd144fff7ab186cf6b5654ba1b824` | `6298` |
| `Resources/Fixtures/source/mesh_data.c` | `ff6ab49e9aa12250aa1b4d8b9a63a018b954a5d49b4e89ca2ed6abe60ed2cd43` | `2456` |
| `Resources/Fixtures/source/Makefile` | `7ecc7e683798fe29a0627ade45f10a0aa022e060cf342b413ac4c88a641d925b` | `718` |

The installed `source/Makefile` is the upstream
`ee/draw/samples/cube/Makefile.sample` renamed to `Makefile` by ps2sdk's own
release rule, exactly as it appeared in the downloaded artifact.

AFL 2.0 section 9 calls for a reasonable effort to obtain recipients' express
assent. Therefore, a release that ships this fixture must present the AFL text
and require affirmative assent before exposing or launching the demo. Merely
placing the files in an archive is not treated as satisfying PS2 Emu's release
gate.

## Statically linked toolchain components

The official artifact was built in the ps2dev toolchain container, and strings
in the ELF identify GCC 15.2.0 and newlib objects such as `dtoa.c` and
`mprec.c`. The relevant pinned build provenance is:

| Field | Exact value |
| --- | --- |
| ps2toolchain container index digest | `sha256:e15fcc76f5ae2f450a8359f7541ae806535992099f5df39dd180698b3ef52508` |
| ps2toolchain OCI source revision | `1b32a279d66ba765a19673b00747e22eeda07eef` |
| ps2toolchain-ee config revision | `4795b8357049e86137589af2db3d588cae79a77c` |
| GCC branch | `ee-v15.2.0` |
| GCC resolved commit | `df77d03bc1bd5765b40de554918a5ff541202548` |
| newlib branch | `ee-v4.6.0` |
| newlib resolved commit | `58fb6406408a541e0c826f47487315b485d4db56` |

The exact upstream license collections are included without modification:

- `Resources/Fixtures/NEWLIB-COPYING.txt` from
  `https://github.com/ps2dev/newlib/blob/58fb6406408a541e0c826f47487315b485d4db56/COPYING.NEWLIB`
- `Resources/Fixtures/GCC-COPYING.RUNTIME.txt` from
  `https://github.com/ps2dev/gcc/blob/df77d03bc1bd5765b40de554918a5ff541202548/COPYING.RUNTIME`
- `Resources/Fixtures/GCC-COPYING3.txt` from
  `https://github.com/ps2dev/gcc/blob/df77d03bc1bd5765b40de554918a5ff541202548/COPYING3`

These copies preserve the multi-license notices for newlib and the GPLv3 plus
GCC Runtime Library Exception materials for GCC runtime components. They do
not change the terms that apply to any individual upstream source file.

## Release gate and legal review

This notice records technical provenance and preserves upstream license text;
it is not legal advice and does not by itself approve public binary
distribution. Before a public binary ships, a human must complete a final
license review of the statically linked ELF, confirm that the first-run assent
flow satisfies the applicable terms in every target distribution, and record
that approval in the release evidence. If that review identifies any
additional notice or corresponding-source obligation, publication remains
blocked until it is fulfilled.

Only the exact path, byte size, and SHA-256 listed above are authorized by PS2
Emu's source and package validators. Every other bundled `.elf`, disc image,
BIOS, key, or game payload remains prohibited.

## 日本語の要約

同梱候補は、市販ゲームではなく、公式ps2sdk CIが生成した未改変の回転
Cube Demoです。実行時のダウンロードは行わず、上記の固定ハッシュ以外は
検証で拒否します。AFL 2.0、newlib、GCC runtimeの原文を同梱し、初回起動時
の明示同意と人間による最終ライセンス確認が完了するまで、バイナリ公開は
許可されません。
