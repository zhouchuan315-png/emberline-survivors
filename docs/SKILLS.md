# 本项目的 skills

核实时间：2026-09-23。用户来源：https://x.com/lxfater/status/2102596393332576667 。X 网页直接访问失败，正文通过 FxTwitter 公共镜像读取；skills 目录通过 skills.sh 搜索，并下载 GitHub 源仓库检查实际 SKILL.md。没有把转帖文字当作安装脚本。

## 已选用

| Skill | 来源 | 适用工作 | 安装位置 |
|---|---|---|---|
| cocos-skill | 本机已有 | Creator 工程、场景、资源导入与构建 | /Users/xm/.codex/skills/cocos-skill |
| game-feel | https://github.com/gamedev-skills/awesome-gamedev-agent-skills/tree/main/skills/disciplines/game-feel | 枪口/命中反馈、击退、粒子和适度震屏 | .agents/skills/game-feel |
| game-design-theory | https://github.com/pluginagentmarketplace/custom-plugin-game-developer/tree/main/skills/game-design-theory | 核心循环、奖励、难度、构筑平衡 | .agents/skills/game-design-theory |
| game-ui-design | https://github.com/omer-metin/skills-for-antigravity/tree/main/skills/game-ui-design | HUD、菜单、升级面板、触屏可读性 | .agents/skills/game-ui-design |
| agent-browser | 本机已有 | 验证真实 Cocos Web 导出、按键、截图与报错 | /Users/xm/.agents/skills/agent-browser |

新增的三个 skill 均安装到本项目，不覆盖全局配置。在本项目的新任务/下一轮可发现，也可按绝对路径读取。源文件和引用保持原样；其中示例含其他引擎时只借鉴通用方法，具体实现以 Cocos API 为准。

## 转帖其余项目如何取舍

- `higgsfield-websites`：素材服务与本次用户明确指定的 Apifox V2 流程不同，本次不安装。
- `game-engine`：转帖名称过于通用；当前已有明确支持 Cocos 3.8 的本地 skill，优先使用后者。
- `game-developer`：转帖描述面向 Unity / Unreal；不用于替换本项目 Cocos 工程规范。
- `multiplayer-game`：转帖注明历史版本，本项目首版单人，不引入房间与联机后端。
- `develop-web-game`：转帖注明 OpenAI 历史版本；官方 curated 列表本轮返回 HTTP 403，未把猜测的旧路径当现行 skill 安装。浏览器回归由已有 agent-browser 完成。
- 同源仓库的 `roguelike` 已检查，内容主要是回合制网格地牢，并明确排除实时动作。虽然名称相近，也不适合本作的生存割草主循环。

这些 skills 是开发指导文件，不是游戏运行时依赖。打包游戏无需携带它们。
