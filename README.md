# PS2 Emu

PS2 Emu は、ゲームを整理して起動するためのmacOS / Windows向けローカルライブラリです。macOS版はSwiftUI、Windows版はElectronで実装し、実際のエミュレーションは独立した公式Play!が別プロセスで担当します。ローカルmacOS開発版には固定したPlay! `0.77-7-g04bde0df`を同梱できますが、4種類の公開候補はすべてPlay!非同梱です。macOS版は別途導入したPlay!を署名、Team ID、version、architecture、CDHashで厳格検証します。Windows版は同じcommitの公式CI x64 build 1件をhash-onlyで固定し、標準コアの毎回の起動直前に`Play.exe`と必須Qt 6ファイルのSHA-256、サイズ、x64 PE、Play.exeのversion情報、registry DisplayVersion、未署名状態を完全一致で検証します。これはレビュー済みbyteとの一致を示しますが、Windows版Play!の発行元を証明するものではないため、画面上で明示し、固定identityごとの利用者同意を必須にしています。

> **公開状態:** 正式名称は **PS2 Emu**、wrapperは `Copyright (c) 2026 ten:ten` のMIT Licenseです。4種類とも未署名のローカル候補で、バイナリはまだ全世界公開できません。固定したmacOS Play! `0.77-7-g04bde0df`には認証不要の公式CI公開取得経路を確認済みですが、macOS Developer ID / 公証、Windows Authenticode / SmartScreen、全4対象の実機・clean-machine試験が残っています。詳細は [ADR-0002](docs/ADR-0002-public-core-distribution.md)、[ADR-0003](docs/ADR-0003-four-platform-distribution.md)、[公開チェックリスト](docs/PUBLIC_RELEASE_CHECKLIST.md) を参照してください。

英語を既定にした8言語の恒久ティザーは
[https://tenten-10-10.github.io/ps2-emu/](https://tenten-10-10.github.io/ps2-emu/)
で公開しています。ダウンロードとKo-fiは、署名・実機証跡・受取人確認が揃うまで機械的に無効です。

- macOS Apple Silicon: arm64 SwiftUIランチャー + 外部Play! arm64
- macOS Intel: x86_64 SwiftUIランチャー + 外部Play! x86_64
- Windows 11 x64: x64 Electronランチャー + 外部Play! x64
- Windows ARM64: ARM64 Electronランチャー + Windows 11で外部Play! x64を互換実行（ARM64ネイティブコアではない）
- BIOS: 不要。Play! の HLE 実装を使用
- 対応入力ファイル: `.iso`、`.mds`、`.isz`、`.cso`、`.cue`、`.chd`、`.elf`
- 表示方式: ゲーム画面は PS2 Emu の中ではなく、Play! の別ウィンドウで開く

PS2 Emu は BIOS、市販ゲーム、権利未確認のhomebrew、暗号鍵、ゲームの著作物画像を同梱・取得しません。唯一の例外として、公式ps2sdk CIが生成したオープンソースの **PS2SDK Cube Demo** を、起動確認用fixtureとして固定ハッシュで同梱します。これは市販ゲームではなく、実行時のネットワーク取得も行いません。対応拡張子であることは、個々のゲームが正常に動作することを保証しません。

Cube Demoはps2sdk commit `39a89923ce59152fa855250cfacaccf8e581a1eb`、Actions run `33232694254`、ELF SHA-256 `1293781d9f661763e5e598b8c7037830462b05b53e532c298f8515b0df533584`へ固定しています。ソース、AFL 2.0、newlib、GCC runtimeの原文と詳細な来歴は [PS2SDK-CUBE-NOTICE.md](Resources/Fixtures/PS2SDK-CUBE-NOTICE.md) にあります。validatorはこのexact pathとbyteだけを許可し、他のELF・ディスクイメージ・ゲームpayloadを拒否します。初回のライセンス同意と人間による最終法務確認が完了するまで、バイナリ公開ゲートは閉じたままです。

使い方は [ユーザーガイド](docs/USER_GUIDE.md) を参照してください。

## 構成

SwiftUI / Electron側はライブラリ、検索、お気に入り、プレイ履歴、起動設定、プロセス状態、ログを管理します。Play!側は映像、音声、コントローラー入力、メモリーカード、セーブステート、ゲーム互換性を管理します。

ディスクイメージは `--disc <絶対パス>`、homebrew ELF は `--elf <絶対パス>` として、シェルを介さず Play! に渡します。フルスクリーン設定が有効な場合は `--fullscreen` も渡します。一度に起動できる Play! プロセスは1つです。

同梱版の来歴は次のとおりです。

| 項目 | 値 |
| --- | --- |
| Upstream | [jpd002/Play-](https://github.com/jpd002/Play-) |
| Version | `0.77-7-g04bde0df` |
| Commit | `04bde0df87ee7c0e2f0151b51bb2cc22c88541da` |
| GitHub Actions run | [31526392870 — Build macOS](https://github.com/jpd002/Play-/actions/runs/31526392870) |
| Artifact | `Play_MacOS_dmg` |
| Official CI public download | [Play.dmg at commit `04bde0df`](https://s3.us-east-2.amazonaws.com/playbuilds/04bde0df/Play.dmg) |
| DMG SHA-256 | `14afd05a9da78071bbe99be54c9def818f976c583f612479a75bc5c39fd02aaa` |
| License | BSD 2-Clause |

設計判断と制約は [ADR-0001](docs/ADR-0001-emulation-engine.md)、ライセンス全文と来歴は [Play-License.txt](Resources/Play-License.txt) および [THIRD-PARTY-NOTICES.md](Resources/THIRD-PARTY-NOTICES.md) にあります。

## ビルド

### 必要環境

- Apple Silicon Mac（arm64ビルドとx86_64クロスビルドに使用）
- macOS 14 以降
- Swift 5.10 を含む Xcode または Xcode Command Line Tools
- 初回のローカル開発用コア取得時のみ、公式CI公開S3へのHTTPS接続

アプリをビルドして検証します。

```sh
cd '/path/to/ps2-emulator'
./scripts/build-app.sh
./scripts/verify-app.sh
```

上記の既定モードは、Play! を含むローカルMVP専用です。公開候補の外部コア版は、専用の出力先を使い、モードを全工程へ明示します。

```sh
PS2_BUNDLE_PLAY=0 ./scripts/build-app.sh '/absolute/path/to/unbundled-output'
PS2_BUNDLE_PLAY=0 ./scripts/verify-app.sh '/absolute/path/to/unbundled-output/PS2 Emu.app'
```

`build-app.sh` は最初に `swift test` を実行し、`PS2_TARGET_ARCH=arm64|x86_64`で指定したthin実行ファイルをreleaseビルドします。既定の同梱ローカルモードだけが、Play!を再ビルド・再署名せず `Contents/Helpers/Play.app` へコピーします。`PS2_BUNDLE_PLAY=0` の外部コアモードは、Play.appとPlay!専用noticeを出力へ含めません。既存の出力アプリがある場合は、`.build/previous-apps/` へ退避します。

macOS外部コア候補をarchitecture別に作る例:

```sh
PS2_TARGET_ARCH=arm64 PS2_BUNDLE_PLAY=0 ./scripts/package-dmg.sh '/absolute/path/to/arm64-output'
PS2_TARGET_ARCH=x86_64 PS2_BUNDLE_PLAY=0 ./scripts/package-dmg.sh '/absolute/path/to/x86_64-output'
```

Windows x64 / ARM64ランチャーをcross-packageする例:

```sh
cd windows
npm install
npm test
npm run package:windows
npm run verify:windows
```

Windows成果物はこのMac上で構造・PE architectureを検査できますが、実際の起動、外部Play!、音声、入力、保存、SmartScreenはWindows 11 x64 / Windows 11 ARM64実機での確認が必要です。

既定の同梱ローカルモードで `Vendor/Play.app` がまだ無い場合、`build-app.sh` は `fetch-play-core.sh` を呼び、公式CIがcommit別に公開した固定S3 URLから認証なしで取得します。このS3上のDMGは上記Actions artifact内のDMGとbyte一致を確認済みです。DMGのSHA-256と構造、Play!のバージョン、コード署名、Team ID、architecture別CDHash、Gatekeeper評価が一致しない場合は失敗して停止します。外部コアモードは取得処理を行いません。コア取得だけを先に行う場合:

```sh
./scripts/fetch-play-core.sh
```

テストだけを実行する場合:

```sh
swift test
```

### DMG の作成

`package-dmg.sh` は常に現在のソースからアプリを作り直し、検証してから DMG を作成します。

```sh
PS2_BUNDLE_PLAY=1 \
PS2_ALLOW_LOCAL_BUNDLED_DMG=1 \
./scripts/package-dmg.sh
```

`package-dmg.sh` は配布モード未指定では停止します。同梱版DMGの作成には上記2変数が必要で、ファイル名にも `LOCAL-DO-NOT-DISTRIBUTE` が入ります。

既定の出力先はプロジェクト内の次の場所です。

```text
dist/PS2 Emu.app
dist/PS2-Emu-0.1.0-LOCAL-DO-NOT-DISTRIBUTE-macOS-arm64.dmg
```

未署名の外部コア候補は、正式な公開成果物との取り違えを防ぐため次の名前になります。

```text
PS2-Emu-0.1.0-macOS-arm64-UNSIGNED-DO-NOT-DISTRIBUTE.dmg
PS2-Emu-0.1.0-macOS-x86_64-UNSIGNED-DO-NOT-DISTRIBUTE.dmg
```

Developer ID署名を通過した外部コア版だけが `PS2-Emu-0.1.0-launcher-macOS-<arch>.dmg` という正式候補名を使用します。

既定の同梱ローカルモードで作成したアプリ内のコアは次に配置されます。外部コア版にはこのパス自体がありません。

```text
dist/PS2 Emu.app/Contents/Helpers/Play.app
```

任意の出力フォルダを使う場合:

```sh
./scripts/build-app.sh '/absolute/path/to/output'
./scripts/verify-app.sh '/absolute/path/to/output/PS2 Emu.app'
PS2_BUNDLE_PLAY=1 PS2_ALLOW_LOCAL_BUNDLED_DMG=1 \
  ./scripts/package-dmg.sh '/absolute/path/to/output'
```

別の公式 `Play.app` をビルド時だけ指定することもできます。ただし、固定版を変更する場合は来歴、ライセンス、署名、CLI 互換性を改めて確認し、ADR と third-party notice も更新する必要があります。

```sh
PLAY_CORE_APP='/absolute/path/to/Play.app' ./scripts/build-app.sh
```

### 公開用 Developer ID 署名と公証

通常の `package-dmg.sh` はローカル検証用の ad hoc 署名です。公開候補では `PS2_BUNDLE_PLAY=0`、正確な Developer ID Application identity、所有者確認済みTeam IDをすべて明示すると、外部コア版の外側アプリを Hardened Runtime と secure timestamp 付きで署名し、続けて DMG も署名します。共有release verifierはbundle ID、version、build、Team ID、配布モード、Play.app不在、必要文書、DMG名を再検査します。同梱ローカル版のDeveloper ID署名・公証は明示的に拒否します。

```sh
DEVELOPER_ID_APPLICATION='Developer ID Application: Legal Name (TEAMID)' \
EXPECTED_OUTER_TEAM_ID='TEAMID' \
SOURCE_REVISION='40-character-reviewed-commit' \
PS2_BUNDLE_PLAY=0 \
./scripts/package-dmg.sh '/absolute/path/to/unbundled-output'
```

Appleへ送信する認証情報はコマンドやリポジトリへ書かず、事前に所有者が作成した `notarytool` の Keychain profile 名だけを渡します。送信が `Accepted` になった後、スクリプトは DMG に ticket を staple し、`stapler`、`hdiutil`、`spctl` で再検証します。

```sh
NOTARYTOOL_PROFILE='ps2-emulator-notary' \
EXPECTED_OUTER_TEAM_ID='TEAMID' \
SOURCE_REVISION='the-same-40-character-reviewed-commit' \
PS2_BUNDLE_PLAY=0 \
./scripts/notarize-dmg.sh '/absolute/path/to/unbundled-output/PS2-Emu-0.1.0-launcher-macOS-arm64.dmg'
```

Apple Developer契約、証明書、Keychain profile、本人確認を自動作成・変更する処理はありません。公開前の全ゲートは [PUBLIC_RELEASE_CHECKLIST.md](docs/PUBLIC_RELEASE_CHECKLIST.md) を参照してください。

通常の外部コア版は `/Applications/Play.app`、次に `~/Applications/Play.app` を探索し、固定した発行元・署名・バージョン・CDHash・architectureを検証します。開発者が改変コアを明示的に使う場合だけ、絶対パスの `PS2_EMULATOR_CORE_APP` と `PS2_EMULATOR_ALLOW_MODIFIED_CORE=1` の両方が必要です。片方だけ、相対パス、`1`以外はfail closedになります。パッケージ作成時の `PLAY_CORE_APP` とは用途が異なります。

### 署名と検証の範囲

`build-app.sh` は外側の PS2 Emu を ad hoc 署名し、`verify-app.sh` は選択した配布モード、app構造、実行ファイル、コード署名、architectureを確認します。同梱モードではさらに Play! の固定fingerprintと `--self-test` を検査します。外部コアモードでは Play.app とPlay!専用noticeが存在しないことを検査し、実際の外部Play!探索・起動は実機テストの対象にします。

`sign-release-app.sh` と `notarize-dmg.sh` は正式なDeveloper ID署名・公証工程を実装していますが、証明書やKeychain profileを自動作成・変更しません。公開操作は、LICENSEを含むcleanなGit作業ツリー、HEADと一致する明示的な`SOURCE_REVISION`、所有者確認済みTeam IDを要求し、そのcommitをappのInfo.plistへ埋め込みます。現在のローカル成果物には正式署名も公証ticketもないため、そのまま第三者へ配布できません。

自動テストと `verify-app.sh` は実ゲームの起動、映像、音声、コントローラー、メモリーカード、セーブステートの実動作までは検証しません。

同梱する公式ps2sdk Cube Demo ELFを使う手動の映像smoke testも用意しています。これは市販ゲームやSony BIOSを含まず、ELFのSHA-256を確認してからPlay!を起動します。`--fetch-only` は公式CI artifactの取得・検証だけを行い、ウィンドウを開きません。公開ランタイムはネットワーク取得を行わず、同梱したexact byteだけを使用します。

```sh
./scripts/smoke-test-cube.sh --fetch-only
./scripts/smoke-test-cube.sh
```

今回の自動検証では `--fetch-only` まで実施しており、GUIを伴う回転キューブの描画確認は未実施です。

## ソースとデータの場所

```text
Sources/PS2Emulator/       SwiftUI アプリとライブラリ／起動処理
Tests/PS2EmulatorTests/    自動テスト
windows/                   Windows x64 / ARM64 Electronランチャー、テスト、packager
Resources/                 Info.plist、Play! notice、固定Cube Demo・source・license
Vendor/Play.app/           固定した公式 Universal Play! コア
scripts/                   コア取得、ビルド、検証、DMG、アイコン、手動smoke test
docs/                      ユーザーガイドと設計記録
release/                   4対象のcanonical release manifest
site/                      英語優先・8言語・4プラットフォームのティザーサイト
```

ランチャーのライブラリ情報とログはOSごとのユーザーデータ領域へ保存されます。

| 対象 | ライブラリ | ログ |
| --- | --- | --- |
| macOS arm64 / x86_64 | `~/Library/Application Support/PS2 Emulator/library.json` | `~/Library/Logs/PS2 Emulator/` |
| Windows x64 / ARM64 | `%APPDATA%\PS2 Emulator\library.json` | 通常は `%APPDATA%\PS2 Emulator\logs\PS2 Emulator\` |

正式名称変更前の利用者データを失わないため、0.1.0は内部保存ディレクトリ名
`PS2 Emulator`とBundle ID `jp.planter.ps2emulator`を互換識別子として維持します。
画面、アプリ、配布物の公開名称だけが`PS2 Emu`です。

実ゲームファイルはコピーされず、元の絶対パスだけが記録されます。ゲーム内セーブ、メモリーカード、セーブステート、Play! の設定は Play! が所有し、PS2 Emu の `library.json` には入りません。

詳しい扱いは [ユーザーガイド](docs/USER_GUIDE.md#データとセーブの所有範囲) を参照してください。

## 公開ソースとCI

`release/release-manifest.json` は4対象のversion、architecture、外部コア方針、予定候補名と機械検証可能な主要公開gateを一元化し、`scripts/verify-release-manifest.mjs` がmacOS、Windows、サイト設定とのずれを検出します。Windows標準コアの承認方針とruntime統合も独立gateとして保持します。公開前は全候補を `blocked`、公開artifact名・SHA-256・publisherを `null` のままにします。

公開ソースは [tenten-10-10/ps2-emu](https://github.com/tenten-10-10/ps2-emu) でMIT Licenseにより提供します。公開ソースZIPはclean Git commit、所有者選択済み`LICENSE`、一致する40桁`SOURCE_REVISION`を要求します。明示allowlist外、`Vendor/`、生成物、依存物、内部`AGENTS.md`、credential、署名鍵、ローカル絶対パスがtracked fileやGit履歴、source archiveへ入れば停止します。ローカル開発ツリーをそのまま公開せず、review済みファイルだけで作成したcleanな公開履歴を正本とします。

`.github/workflows/ci.yml` はmacOS arm64、macOS Intel、Windows x64、Windows 11 ARM、8言語サイトと公開境界を検証するsecret-free CIです。署名、公開、artifact uploadは行いません。wrapper licenseはMITに決定済みで、source-boundary jobは`LICENSE`、clean Git history、一致する`SOURCE_REVISION`を要求します。判断記録は [LICENSE_DECISION.md](docs/LICENSE_DECISION.md) にあります。

## 法的境界

- 自分が適法に作成・利用できるゲームイメージ、または配布・実行許可のある homebrew ELF だけを使用してください。
- BIOS、市販ゲーム、権利未確認のhomebrew、暗号鍵、著作権で保護されたゲーム画像を本アプリへ追加配布しないでください。唯一許可される実行payloadは、上記の固定SHA-256とライセンス一式を持つPS2SDK Cube Demoです。
- Play! は BSD 2-Clause ライセンスの独立した第三者プロジェクトです。最初の公開候補は Play! を再配布せず、公式配布元からの別途導入を案内します。同梱版を将来再配布する場合は、Play!だけでなくQt、MoltenVK、データファイルを含む全依存物の許諾・notice・必要な対応ソースを別途解決する必要があります。
- PS2 Emu は Sony Interactive Entertainment、PlayStation、Play! プロジェクトの承認・提携を示すものではありません。

任意支援の初回providerはKo-fiに決定しました。方針は [SUPPORT_PAYMENTS.md](docs/SUPPORT_PAYMENTS.md) にあります。支援機能を将来有効化する場合も、Webサイトは所有者確認済みのKo-fi HTTPSページへ遷移するだけで、カード情報や決済用秘密鍵を保持しません。Ko-fi URL、受取人、KYC、入金先が未確認のため、現在は決済を無効化しURLも空です。
