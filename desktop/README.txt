余烬防线 / Emberline Survivors 0.2.1

离线桌面版，包含当前三张地图、三个角色、商城、小 Boss 与三阶段最终 Boss。
0.2.0 新增三英雄觉醒（3 / 6 / 9 级）、爆破弹、连锁电弧、连杀狂热与三种高阶进化。
0.2.1 修复爆破火球 / 烟雾被裁成方块及逐帧偏移；自爆怪只播放一次爆炸，取消重复死亡烟团和倒地动画。
不需要安装 Cocos Creator、Node.js、Python 或浏览器，也不需要启动预览服务器。

Windows 10 / 11（64 位）
完整解压 Windows-x64 ZIP，在解压后的目录里双击 EmberlineSurvivors.exe。
不要在 ZIP 内直接启动，也不要单独移动 EXE；旁边的 DLL、resources 等文件需要保留。

macOS 13 或更高版本
Apple Silicon 包用于 M1 / M2 / M3 / M4 等苹果芯片；Intel 包用于 Intel 处理器。
解压后将 Emberline Survivors.app 拖入“应用程序”，再双击启动。
可在“关于本机”查看芯片类型。

签名说明
这是本地测试发行包。Windows 未使用发布者代码签名证书；Mac 使用本地 ad hoc 签名，
未进行 Apple Developer ID 签名和公证，系统可能显示发布者 / 来源提示。
确认文件来源后，可按系统提示处理；macOS 可在“系统设置 > 隐私与安全性”中查看打开选项。
不要关闭系统安全保护。正式公开发行需要后续完成签名、公证。

操作
WASD / 方向键移动；自动开火；R 换弹；空格冲刺；Esc / P 暂停。
Enter 开始 / 继续；数字 1 / 2 / 3 选强化；F11 切换全屏。
暂停或结算时 R 返回营地；营地 G 打开商城、C 选择战区；M 静音。

本地存档
Windows：%APPDATA%\EmberlineSurvivors
macOS：~/Library/Application Support/EmberlineSurvivors
金币、角色专属天赋树、库存、角色和战区选择会自动保存。当前版本使用 v2 本地存档；首次打开旧 v1 存档会一次性迁移并返还旧通用天赋成本，之后不再保存旧通用天赋。战斗本身不支持退出后续局。
升级游戏包、移动应用不会清除存档；备份时先退出游戏，再复制整个存档目录。
桌面版与之前浏览器试玩各自保存进度，不自动迁移，不支持云同步。

验证范围
Apple Silicon Mac：实际启动、资源加载、键盘战斗、暂停、商店与重启存档验证。
Windows x64 / Intel Mac：交叉打包、架构和资源完整性检查；尚未在对应硬件上实玩。
