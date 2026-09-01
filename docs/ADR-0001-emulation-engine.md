# ADR-0001: MVP のエミュレーションエンジンとして公式 Play! アプリを利用する

- Status: Accepted for the bundled local MVP; public-distribution portions superseded by ADR-0002
- Date: 2026-08-31
- Deciders: PS2 Emu maintainers

> **Scope update:** This ADR remains the decision for the local bundled MVP and
> for using the standalone Play! process as the emulation engine. After the
> redistribution audit, [ADR-0002](ADR-0002-public-core-distribution.md)
> supersedes every public-distribution statement here: the first public
> launcher does not bundle or redistribute Play.app and instead validates a
> separately installed official copy.

## Context

PS2 Emu の MVP は、PS2 エミュレーターそのものを新規実装するのではなく、macOS ネイティブの SwiftUI 製ゲームライブラリ／ランチャーと、実績のあるオープンソースのエミュレーションエンジンを一体で配布する。MVP では次を優先する。

- Apple Silicon 上でネイティブに動作すること。
- ユーザーに PS2 BIOS の準備を要求せず、アプリにも BIOS を同梱しないこと。
- 映像、音声、コントローラー、JIT、セーブステートなど、エミュレーション実行系を上流プロジェクトの実装に任せること。
- 署名・公証済みの上流バイナリとライセンス来歴を壊さず、短期間で検証可能な MVP を完成させること。
- ゲームイメージ、BIOS、暗号鍵、著作権で保護されたゲーム画像を配布しないこと。

SwiftUI 側の責務は、ユーザー所有コンテンツの登録、ライブラリ表示、検索・並べ替え、起動設定、プレイ履歴、エラーとログの提示に限定する。実際のエミュレーション画面と実行時状態は、別プロセスの Play! が所有する。

## Decision

MVP は、Play! の公式 macOS ビルドに含まれる署名・公証済みのスタンドアロン `Play.app` を変更せずにアプリへ同梱し、`Process` から上流の CLI を直接呼び出す。

採用する上流成果物を次に固定する。

| 項目 | 固定値 |
| --- | --- |
| Project | [jpd002/Play-](https://github.com/jpd002/Play-) |
| Upstream commit | `04bde0df87ee7c0e2f0151b51bb2cc22c88541da` |
| Upstream version | `0.77-7-g04bde0df` |
| Official GitHub Actions run | [`31526392870` — Build macOS](https://github.com/jpd002/Play-/actions/runs/31526392870) |
| Artifact | `Play_MacOS_dmg` |
| Official CI public object | [`04bde0df/Play.dmg`](https://s3.us-east-2.amazonaws.com/playbuilds/04bde0df/Play.dmg) |
| DMG SHA-256 | `14afd05a9da78071bbe99be54c9def818f976c583f612479a75bc5c39fd02aaa` |
| Bundled app | `Play.app`（上流成果物を無変更で使用） |
| License | BSD 2-Clause |

配布時の配置先は、macOSの標準的なネストコード配置である `PS2 Emu.app/Contents/Helpers/Play.app` とし、実行ファイルはその中の `Contents/MacOS/Play` とする。開発実行では同じ未変更バンドルを `Vendor/Play.app` から参照できる。

起動契約は次のとおりである。パスはシェル文字列へ連結せず、`Process.executableURL` と `Process.arguments` に分けて渡す。

```text
Play.app/Contents/MacOS/Play [--fullscreen] --disc <ゲームイメージの絶対パス>
Play.app/Contents/MacOS/Play [--fullscreen] --elf  <ELF の絶対パス>
```

引数なしの起動は Play! の設定画面を開くために使用できる。SwiftUI ランチャーは子プロセスの起動、終了状態、ログだけを管理し、Play! のウィンドウ、映像、音声、入力、メモリーカード、セーブステートの内部実装を再実装しない。

MVP では libretro コアを直接ロードせず、PCSX2 も同梱・起動しない。

## Options considered

### 1. 公式スタンドアロン Play! を別プロセスで起動する — 採用

| 利点 | 欠点 |
| --- | --- |
| 公式 macOS ビルドが Apple Silicon でネイティブ動作する | エミュレーション画面は SwiftUI ウィンドウ内に埋め込まれず、別ウィンドウになる |
| PS2 BIOS が不要で、BIOS 選択 UI や配布上の BIOS リスクを持ち込まない | ランチャーから制御できるのは上流 CLI とプロセス境界に限られる |
| 映像、音声、入力、JIT、メモリーカード、セーブステートを上流の完成済み実装に任せられる | ゲーム互換性は Play! の対応状況に依存する |
| 上流の Developer ID 署名を維持し、オンライン Gatekeeper で評価できる | 上流更新ごとに成果物の来歴、署名、Gatekeeper評価、挙動を再検証する必要がある |
| コアのクラッシュを SwiftUI ランチャーのプロセスから分離できる | SwiftUI とエミュレーター間でオーバーレイやフレーム単位の連携はできない |

これは「カスタム macOS アプリ」というプロダクト価値をライブラリ／ランチャー側に置きながら、MVP の技術リスクを最も小さくする選択である。

### 2. Play! libretro コアを SwiftUI アプリ内で直接ホストする — Phase 2

| 利点 | 欠点 |
| --- | --- |
| Metal/AppKit ビューへの表示を含め、1 ウィンドウの体験を設計できる | libretro frontend API、環境コール、ライフサイクルを自前実装する必要がある |
| 一時停止、入力、オーバーレイ、状態管理をランチャーと緊密に統合できる | Play! が要求する OpenGL 3.2 ハードウェアコンテキスト、映像フレーム、44.1 kHz ステレオ音声、GameController 入力を正しく橋渡しする必要がある |
| 将来はフレーム処理や独自 UI を追加しやすい | JIT entitlement、スレッド、音声同期、終了処理、セーブデータ／ステート保存までホスト側の責任が広がる |
| 別ウィンドウをなくせる | 上流スタンドアロン版が既に提供する実行系を重複実装するため、MVP の完成と検証が遅れる |

直接 libretro ホストは却下ではなく、アプリ内レンダリングが必要になった時点の Phase 2 候補とする。着手前に別 ADR を作成し、コアの固定コミット、バイナリ来歴、ライセンス、JIT entitlement、OpenGL/Metal 連携、音声同期、入力、セーブ互換性を再評価する。

### 3. PCSX2 をエンジンとして利用する — 互換性フォールバック候補

| 利点 | 欠点 |
| --- | --- |
| 多くのタイトルで高い互換性を期待でき、Play! で動作しないゲームの代替になり得る | ユーザー自身が適法に取得した PS2 BIOS を用意する必要があり、BIOS 管理 UI と検証が増える |
| 成熟した設定、レンダラー、ゲーム別対応情報がある | PCSX2 の GPL ライセンスに沿った配布物、通知、対応ソースの提供手順を別途設計する必要がある |
| 将来、明示的に選べる追加エンジンとして提供できる | バイナリサイズ、設定、CLI 差異、セーブデータ、サポート範囲が増え、MVP が複雑になる |

PCSX2 は MVP の既定エンジンにしない。Play! で不足する互換性が実測された場合に限り、ユーザー提供 BIOS、GPL コンプライアンス、独立した来歴管理を前提とする任意のフォールバックとして別 ADR で検討する。PS2 Emu が BIOS を取得、ダウンロード、同梱することはない。

## Trade-off analysis

MVP では、単一ウィンドウへの統合や最大互換性よりも、上流が完成させた実行系、BIOS 不要、Apple Silicon ネイティブ動作、署名・公証と来歴の保持を優先する。そのため、別プロセス／別ウィンドウという UX 上の制約を受け入れる。

直接 libretro ホストは最も自由度が高いが、frontend 実装そのものが新しいエミュレーター統合作業になる。PCSX2 は互換性面の利点がある一方、BIOS と GPL 配布対応を MVP に持ち込む。現時点では、どちらもスタンドアロン Play! より完成リスクが高い。

## Licensing and provenance constraints

1. `Play.app` は上記GitHub Actions runの`Play_MacOS_dmg`、またはそのDMG payloadとbyte一致を確認した上記commit-addressed公式CI公開objectから取得した成果物だけを使用する。`latest` URLやローカルで再ビルドしたバイナリへ黙って差し替えない。
2. 内包する `Play.app` の実行ファイル、`Info.plist`、リソース、署名、entitlementsを変更しない。外側のアプリを署名するときも、内側の Play! を `--deep` などで再署名しない。固定成果物には stapled ticket がないため、その有無を誤って配布保証に含めない。
3. ベンダリング時にダウンロードした DMG の SHA-256 を記録する。展開後の `Play.app` は Bundle ID、version、Team ID、全architectureを含む厳格署名、CDHash、Gatekeeper評価を固定し、配布前と実行直前の両方で検証する。固定値を変更する場合は、この ADR または後続 ADR と third-party notice を更新する。
4. 上流の BSD 2-Clause 条件を満たすため、著作権表示、条件、免責条項を `Resources/Play-License.txt` に全文保持し、`Resources/THIRD-PARTY-NOTICES.md` にプロジェクト URL、commit、version、run、artifact を記載する。
5. 外側のアプリの署名前後で、内側の `Play.app` に対して署名の厳格検証と Gatekeeper／公証の検証を行う。検証に失敗した成果物は配布しない。
6. PS2 BIOS、ゲームイメージ、暗号鍵、著作権で保護されたゲーム画像をアプリ、リポジトリ、テストデータ、配布物へ含めない。ユーザーが選択したファイルは元の場所から読み取り、シェルを介さず絶対パスで Play! に渡す。
7. Play! の名称とライセンス情報は第三者コンポーネントとして明示し、PS2 Emu または開発者が Play!／Sony Interactive Entertainment から承認・提携を受けていると誤認させない。

## Consequences

### Positive

- SwiftUI 側はライブラリと起動体験に集中でき、エミュレーションの映像、音声、入力、保存機能を短期間で提供できる。
- BIOS を要求・同梱しないため、初回導入が簡潔になり、BIOS 配布に関する法的・運用上の危険を避けられる。
- Play! の署名・公証済みアプリをプロセス境界ごと保つため、上流成果物の真正性を検証しやすい。
- 子プロセスの異常終了を検出してログを提示でき、SwiftUI ライブラリ自体への影響を限定できる。

### Negative

- エミュレーションは Play! の別ウィンドウで行われ、SwiftUI 内レンダリング、独自 HUD、フレーム単位制御は提供できない。
- Play! 非対応タイトルについては、MVP だけでは互換性を補えない。
- 上流成果物の更新は自動化できず、固定版ごとに署名、公証、アーキテクチャ、CLI、起動、入力、音声、保存の回帰確認が必要になる。
- Play! の設定と保存データの所在・形式は上流実装に従い、ランチャーから直接変更しない。

## Follow-up actions

- 固定した `Play_MacOS_dmg` から `Play.app` を無変更でベンダリングし、DMG SHA-256と、app bundleのBundle ID・version・Team ID・CDHashを配布用来歴記録へ追加する。
- `codesign`、Gatekeeper、stapled ticket の有無、Apple Silicon アーキテクチャ、上流 version の preflight を配布手順に組み込む。
- `--disc`、`--elf`、`--fullscreen`、引数なし設定起動、空白・日本語を含む絶対パス、コア欠落、異常終了をテストする。
- ユーザー所有の合法なコンテンツだけで、映像、音声、コントローラー、メモリーカード、セーブステート、終了後の再起動を実機 smoke test する。
- アプリ内レンダリングが MVP 後の要件になった場合は、直接 libretro ホストについて ADR を追加する。
- 実測した互換性不足が重大な場合は、PCSX2 を任意フォールバックとして扱う別 ADR を追加する。
