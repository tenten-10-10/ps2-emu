# PS2 Emu ユーザーガイド

## はじめに

PS2 Emuは、所有するゲームイメージや許可されたhomebrew ELFを整理し、
別途インストールした公式Play!で起動するmacOS / Windows向けローカル
ランチャーです。外側のランチャーがライブラリと起動を担当し、ゲームは別
プロセスのPlay!ウィンドウで動きます。

> **現在の公開状態:** バージョン0.1.0の4候補は、すべて未署名のローカル
> 検証物です。macOSのDeveloper ID署名・公証、WindowsのAuthenticode署名、
> 実機・clean-machine試験、配布署名などが未完了のため、一般公開・
> 配布・セキュリティ警告の回避をしてはいけません。

### 4つの対象

| ダウンロード候補 | 必要環境 | ランチャー | 別途必要なPlay! |
| --- | --- | --- | --- |
| macOS Apple Silicon | macOS 14以降のApple Silicon Mac | arm64 SwiftUI | arm64 |
| macOS Intel | macOS 14以降のIntel Mac | x86_64 SwiftUI | x86_64 |
| Windows x64 | Windows 11 x64（現在の実機試験対象） | x64 Electron | x64 |
| Windows ARM64 | Windows 11 on Arm | ARM64 Electron | x64をWindows互換レイヤーで実行 |

Windows ARM64版でネイティブなのはランチャーだけです。Play!コアはx64で、
Windows 11が互換実行します。ARM64ネイティブのエミュレーターコアではなく、
Windows 10 on Armはこの構成の対象外です。

- Play!本体: 4つの公開候補には同梱しません。公式配布元から別途導入します
- BIOS: 不要。BIOSを探したり、本アプリへ追加したりする必要はありません
- 対応ファイル: `.iso`、`.mds`、`.isz`、`.cso`、`.cue`、`.chd`、`.elf`
- 表示方式: ゲーム映像はPS2 Emu内ではなくPlay!の別ウィンドウに表示します
- 検証デモ: 未改変・固定SHA-256の`PS2SDK Cube Demo`を1本だけ同梱します

PS2 EmuはPlay!、Qt、MoltenVK、`states.db`、市販ゲーム、BIOS、暗号鍵、
著作権で保護されたゲーム画像を公開候補へ同梱・取得しません。唯一の例外は、
AFL 2.0、newlib、GCCの必要通知と正確なソースを同梱するオープンソースhomebrew
`PS2SDK Cube Demo`です。対応拡張子であることは、ファイルの安全性、完全性、
適法性、ゲーム互換性を保証しません。

## 最初から入っている検証デモ

初回ライブラリには`PS2SDK Cube Demo`が表示されます。これは市販ゲームではなく、
Play!のELF起動と描画を確認するためにps2devの公式CI成果物から取り込んだ
homebrewデモです。起動のたびにサイズとSHA-256
`1293781d9f661763e5e598b8c7037830462b05b53e532c298f8515b0df533584`
を検証し、不一致なら実行しません。ライブラリから削除した後は自動復元しません。
アプリ内の「オープンソースライセンス」で帰属、AFL 2.0、newlib、GCC GPLv3と
Runtime Library Exceptionを確認できます。

## Play!を準備する

### macOS Apple Silicon / Intel

現在の未署名macOS公開候補は、`/Applications/Play.app`、次に
`~/Applications/Play.app`を探索します。見つけたPlay!のBundle ID、版、
Developer ID Team、コード署名、CDHash、nested code、実行アーキテクチャが
固定した値と一致した場合だけ起動します。

macOSランチャーが要求するレビュー済みPlay!は、公式CIがcommit別に公開した
[Play! `0.77-7-g04bde0df` DMG](https://s3.us-east-2.amazonaws.com/playbuilds/04bde0df/Play.dmg)
です。SHA-256は
`14afd05a9da78071bbe99be54c9def818f976c583f612479a75bc5c39fd02aaa`
で、Apple SiliconとIntelの両sliceを含みます。一般向け公式download pageの
`0.70`や、別の`latest` buildはstrict検証を通りません。アプリ内の固定リンク
から入手し、`Play.app`を`/Applications`または`~/Applications`へ移してください。

### Windows x64 / Windows ARM64

標準構成は、公式Play! x64を次へ別途インストールした状態を想定します。

```text
%ProgramFiles%\Play\Play.exe
```

標準構成では、固定した公式CI build
`play-0.77-7-g04bde0df-windows-x64-hash-only`だけを許可します。毎回の起動直前に
`Play.exe`と必須Qt 6ファイルのSHA-256、サイズ、x64 PE machine、Play.exeの
ProductName / ProductVersion / FileVersion / OriginalFilename、registry
DisplayVersion、Authenticodeが`NotSigned`であることを完全一致で再検証します。
1つでも変われば起動しません。

この方式は、インストール済みファイルがレビュー済みbyteと同一であることを
確認しますが、そのbyteを誰が発行したかは証明しません。標準Play!を初めて
起動する時と、承認identityが変更された時には、この制限を明記した確認画面へ
同意する必要があります。Windows実機でのcollector・起動・音声・入力・保存の
確認は公開前に別途必要です。

Windows ARM64版は、x64 Play!を初めて起動する前に互換実行の注意を表示し、
選択したコアのSHA-256とOS版に結び付けた同意を求めます。性能、消費電力、
安定性、JIT、ゲーム互換性はWindows x64と異なる場合があります。

### 改変コア

macOSの上級者向け明示設定、またはWindowsの「カスタムコアを選択」を使うと、
公式の固定検証値を満たさないコアをローカルで指定できます。Windowsでは
絶対パスとSHA-256を確認し、同じファイルへの明示同意が必要です。どちらも
publisherや版の信頼性が検証された標準コアとは扱われません。内容と入手元を
自分で確認できない実行ファイルは選択しないでください。

## 初回起動

初回は、適法なファイルだけを使うこと、ローカルパスと履歴・ログが保存される
こと、Sony Interactive Entertainment、PlayStation、Play!と提携していない
ことへの確認が必要です。

現在の未署名ローカル候補でGatekeeper、Microsoft Defender、SmartScreen、
Smart App Controlの警告が出ても、安全機能を無効化したり例外を追加したり
しないでください。公開後は、公式ページに掲載された対象名とSHA-256を確認し、
macOSではDeveloper ID / Gatekeeper / notarization、WindowsではAuthenticode
publisher / timestampとWindows保護機能を確認します。

## ゲームを追加して起動する

### macOS

1. ツールバーまたは「ファイル」メニューから「ゲームを追加…」を選び、対応
   ファイルを選択します。`Command-O`でも開けます。
2. フォルダ単位で登録する場合は「ゲームフォルダを追加…」を選びます。
   `Command-Shift-O`でも開けます。
3. ゲームカードをダブルクリックするか、選択して「起動」を押します。
   `Command-Return`でも起動できます。
4. Play!のゲームウィンドウが別に開きます。ライブラリウィンドウは残ります。

対応ファイルをライブラリへドラッグ＆ドロップして追加できます。Finderで
関連付けられたファイルを開いた場合もライブラリへ追加されます。

macOSで追加したフォルダは再スキャン対象として保存されます。「サブフォルダも
検索」が有効なら配下も検索します。後から追加したファイルは「ゲーム」>
「ライブラリを再スキャン」または`Command-Shift-R`で取り込みます。これは
常時のファイルシステム監視ではありません。

### Windows

1. **Add games / ゲームを追加**で1つ以上の対応ファイルを選択するか、
   **Add folder / フォルダを追加**でフォルダを1回スキャンします。
2. カードの**Play / 起動**を選びます。
3. Play!のゲームウィンドウが別に開きます。停止を要求する場合は上部の
   **Stop / 停止**を選びます。

Windowsのフォルダ追加は、その時点での1回限りの再帰スキャンです。フォルダ
自体を監視・保存せず、自動再スキャンもしません。後から追加したファイルは、
同じフォルダをもう一度追加してください。

### 両OSに共通する注意

`.cue`や`.mds`が別のデータファイルを参照している場合は、参照先を元の相対
関係のまま一緒に保管してください。ライブラリからゲームを削除しても登録情報
だけが消え、元のゲームファイルは削除されません。元ファイルを移動・削除した
場合、ランチャーは自動追跡や復元を行いません。

## ライブラリを整理する

両OSとも表示名またはパスの検索、お気に入り、履歴、元ファイルを変更しない
ライブラリ削除に対応します。macOS版にはフィルター、並べ替え、表示名変更、
Finder表示、再スキャン対象フォルダがあります。現在のWindows版は検索、
お気に入り、起動、削除を中心とする構成で、macOS版と全機能が同一ではありません。

カード画像はタイトルから生成した装飾で、ゲームの公式アートワークではありません。

## 起動と終了

フルスクリーンで開始する場合は設定画面の「フルスクリーンで起動」を有効に
します。この設定は次回のPlay!起動へ`--fullscreen`として渡されます。

一度に実行できるPlay!プロセスは1つです。Play!設定画面を開いている間も、
別のゲームは起動できません。可能ならゲーム内で保存してから停止してください。
停止要求でPlay!が終了しない場合は、Play!ウィンドウを手動で閉じます。

macOSのショートカット：

| 操作 | ショートカット |
| --- | --- |
| ゲームを追加 | `Command-O` |
| ゲームフォルダを追加 | `Command-Shift-O` |
| 選択したゲームを起動 | `Command-Return` |
| エミュレーションを終了 | `Command-.` |
| ライブラリを再スキャン | `Command-Shift-R` |

## コントローラーとPlay!の設定

PS2 Emu自体には、コントローラー割り当て、映像、音声、メモリーカード、
セーブステートを変更する画面はありません。これらはPlay!の機能です。

1. 実行中のゲームまたはPlay!設定ウィンドウを終了します。
2. OSが認識するコントローラーを接続します。
3. macOSでは「設定」>「エンジン」>「Play!の設定を開く」、Windowsでは
   サイドバーの**Open Play! settings / Play!の設定を開く**を選びます。
4. Play!側で入力、映像、音声などを設定し、Play!を終了します。
5. PS2 Emuからゲームを起動します。

設定項目、対応コントローラー、保存形式はPlay!の版に依存します。PS2 Emu
はPlay!の設定を変換・同期しません。

## データとセーブの所有範囲

PS2 Emuが管理するのは、ゲームへの絶対パス、表示名、種類、追加日、
最終起動日、実行時間、お気に入り、ランチャー設定などのライブラリ情報です。
ゲームファイル本体はコピーされません。

| 対象 | ライブラリデータ |
| --- | --- |
| macOS Apple Silicon / Intel | `~/Library/Application Support/PS2 Emulator/library.json` |
| Windows x64 / ARM64 | `%APPDATA%\PS2 Emulator\library.json` |

`PS2 Emulator`は名称変更前から維持する内部データディレクトリ名です。正式名称
`PS2 Emu`へ更新しても既存ライブラリを失わないため、0.1.0では変更しません。

macOSの一般設定は`UserDefaults`の`jp.planter.ps2emulator`ドメインにも保存されます。
Windowsでは、カスタムコアのパス、パスとSHA-256に結び付いた同意、ARM64での
x64互換実行への同意も`library.json`に含まれます。管理者設定により
`%APPDATA%`が別の場所へリダイレクトされる場合があります。

次のデータは別途インストールしたPlay!が所有します。

- ゲーム内セーブと仮想メモリーカード
- セーブステート
- コントローラー、映像、音声などのPlay!設定
- Play!が作成するログ、キャッシュ、補助データ

これらはランチャーの`library.json`には含まれず、ライブラリからゲームを外しても
削除されません。保存場所や形式はインストールしたPlay!の実装に従います。
バックアップ時は、元のゲームファイル、PS2 Emuのライブラリ、Play!側の
保存データを別の所有物として扱ってください。

## ログ

PS2 EmuはPlay!を起動するたびに、子プロセスの標準出力と標準エラーを
保存します。

| 対象 | ランチャーログ |
| --- | --- |
| macOS Apple Silicon / Intel | `~/Library/Logs/PS2 Emulator/` |
| Windows x64 / ARM64 | 通常は`%APPDATA%\PS2 Emulator\logs\PS2 Emulator\` |

macOSでは設定画面の「最新ログを表示」、Windowsでは**Show logs / ログを表示**
から実際の保存場所を開けます。Windowsの基点はElectronのログディレクトリで、
OSや管理者設定により上記の既定値から変わる場合があります。

ログは1ファイル10 MiB、最新20件を上限とし、古い通常の`.log`ファイルだけを
整理します。macOSではowner-onlyのファイル権限を設定します。Windowsでも
制限的なmodeを要求しますが、実際のアクセス範囲はNTFSの継承ACLとローカル
ポリシーに従います。

ログにはゲーム名、ローカルパス、コアの状態、終了コードなどが含まれる場合が
あります。共有前にユーザー名やパスを削除してください。完全なログ、ゲーム、
BIOS、鍵、credentialをサポート報告へ添付しないでください。

## トラブルシューティング

### Play!が見つからない、または検証に失敗する

対象OSとCPUに合う公式Play!を、上記の標準場所へ別途インストールしたか確認
します。macOSでは署名、版、CDHash、アーキテクチャのいずれかが固定値と異なる
と起動しません。Windows標準構成ではx64 Play.exeと隣接Qt構造を確認します。
macOSの固定取得経路は確認済みですが、公開直前にURLの可用性とSHA-256を再確認
してください。Windows標準コアの承認方針とruntime統合は未完了なので、安全
検査を迂回して解決しないでください。

### Windows ARM64でx64コアの注意が表示される

これは正常な境界表示です。ランチャーはARM64ネイティブですが、Play!はx64で、
Windows 11の互換レイヤーを使います。理解できない場合はキャンセルしてください。
Play.exeまたはOS版が変わると再確認が必要になります。

### 「別のゲームが実行中」と表示される

ゲームだけでなく、引数なしで開いたPlay!設定画面も実行中プロセスとして扱われ
ます。Play!の全ウィンドウを終了し、ランチャーが待機状態へ戻ってから再試行します。

### ゲームが見つからない

元ファイルが移動または削除されています。macOSではFinder表示、Windowsでは
カードに表示されるパスで確認し、古い登録を外して新しい場所から追加し直します。
本アプリは元ファイルを復元しません。

### Play!のウィンドウが開かない、またはすぐ終了する

アプリ内のエラーと最新ログを確認します。イメージの完全性やPlay!のタイトル
互換性も確認してください。個々のゲームの対応状況は
[Play! Compatibility Tracker](https://github.com/jpd002/Play-Compatibility)を
参照してください。

### コントローラーが反応しない

ゲームを終了してPlay!の設定を開き、入力デバイスの認識と割り当てを確認します。
PS2 Emu側には独自のコントローラーマッピングはありません。

### OSがアプリを信頼しない

現在の4候補は未署名・非公開です。macOSのGatekeeperを無効化したり、Windowsの
**Run anyway**、Defender除外、SmartScreen / Smart App Controlの無効化で起動
しないでください。正式公開後も、公式ページのSHA-256とpublisherが一致しない
場合は起動せず、[セキュリティポリシー](../SECURITY.md#reporting-a-vulnerability)
に従って報告してください。

報告には、正確なartifact名、PS2 Emu版、4対象のどれか、OS版/build、
物理CPU、artifact SHA-256、標準/カスタムコア、Play!版・パス・architecture・
SHA-256、再現手順、redact済みログを含めると切り分けしやすくなります。

開発者向けのビルド、検証、パッケージ作成手順は[README](../README.md#ビルド)に
あります。

## 現在の制限

- 4候補とも未署名のローカル検証物で、一般公開されていません。
- Apple Silicon版はローカル検証済みですが、Intel版はcross-buildまでで、
  Intel実機とclean Macの公開証跡がありません。
- Windows x64 / ARM64版はmacOS上でcross-package・構造検証した段階で、Windows
  実機での起動、音声、入力、保存、停止、再起動、保護機能を未検証です。
- Windows ARM64版のPlay!はx64互換実行であり、ネイティブARM64コアではありません。
- ゲーム画面はPlay!の別ウィンドウで開き、ランチャー内には表示されません。
- 一度に1つのPlay!プロセスだけを実行できます。
- 互換性、映像、音声、入力、メモリーカード、セーブステートはPlay!に依存します。
- フォルダは常時監視されません。Windowsでは再スキャン対象も保存しません。
- 元ファイルのコピー、移動追跡、自動バックアップ、クラウド同期を行いません。
- BIOS、PCSX2、libretroコアを使用・同梱しません。
- ランチャーはPlay!を自動ダウンロード・更新しません。
- 自動テストと構造検証は、実ゲームによる映像、音声、入力、保存を保証しません。
- ローカル開発用のPlay!同梱laneは公開配布モデルではなく、公開候補へ混ぜません。

## 法的な注意

- 自分が適法に作成・利用できるゲームイメージ、または配布・実行許可のある
  homebrew ELFだけを使用してください。
- PS2 BIOS、ゲームイメージ、暗号鍵、著作権で保護されたゲーム画像は本アプリに
  含まれません。これらをアプリや配布物へ追加しないでください。
- Play!はBSD 2-Clauseライセンスの独立した第三者プロジェクトです。4つの公開
  候補にはPlay!本体やPlay!専用noticeを同梱せず、上流プロジェクトとライセンス
  へ案内します。ローカル同梱版は公開禁止です。
- PS2 EmuはSony Interactive Entertainment、PlayStation、Play!プロジェクト
  からの承認・提携を示すものではありません。
