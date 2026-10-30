# 余烬防线开发约定

- 地雷正式素材为 `expansion/mine-vfx.png`，由 `scripts/prepare-mine-art.py` 从 `evidence/materials-20260929-mines/` 冻结源图派生。生成图集的雷体几何不稳定，不能直接按原图 16 格播放；使用审核的单一雷体与生成的中心灯光合成 4 帧布防、12 帧待机。`MineView` 挂地面层，用 Mine.age 播放，暂停冻结、重开清理；切图前移出旧地面节点，切图后重新挂载。升级卡使用同款帧，规则仍仅在 Simulation。运行 `scripts/mine-runtime-qa.cjs` 和 `scripts/mine-visual-qa.py`，证据 `evidence/runtime-mines-20260929/`。

- 当前三名主角已全部改为二次元女性，最新源 / 派生是 `evidence/materials-20260928-anime-heroes/` 与 `scripts/prepare-anime-heroes.py`；不要运行历史角色脚本恢复旧模型。三套基础 / 移动图集维持 UUID 与 256px 格，`*-portrait` 供选人、`cover-wide` / `cover-tall` 供首页。移动固定上身、交替支撑脚；射击使用同一模型配运行时后坐力与按新枪口锚点的火焰。枪口 / 弹道偏移只用于渲染，不能修改碰撞或伤害。验收使用 `anime-heroes-runtime-qa.cjs`、`roster-gait-runtime-qa.cjs` 与 `ui-runtime-qa.cjs`，新证据 `evidence/runtime-anime-heroes-20260928/`。桌面图标脚本使用新烬火头像，已有桌面 ZIP 不因此视为更新。

- 项目使用本机 Cocos Creator 3.8.6。开始前读 `docs/DESIGN.md` 和 `README.md`。
- Cocos 工程任务使用 `/Users/xm/.codex/skills/cocos-skill/SKILL.md`。
- 本项目专属 skills 位于 `.agents/skills/`；按需读取 `game-design-theory`、`game-feel`、`game-ui-design`，不要加载不相关引擎或联机流程。
- 游戏规则在 `assets/scripts/core/Simulation.ts`；Cocos 适配在 `assets/scripts/Emberline.ts`。规则保持可用 Node 测试，UI 不复制规则。
- 修改规则运行 `npm test`；修改游戏代码运行 `npm run typecheck`、`npm run build`，并对实际 Web 导出进行浏览器验证。Creator 导入生成的 `temp/` 不入库。
- 素材制作每次先查 Apifox 当前契约，按 `docs/DESIGN.md` 中链接的共享服务与质量规则执行。不能直接重跑有提交意图的生成脚本。
- 本轮提示词、Schema、批次、费用、图片 hash 和视觉验收放 `evidence/materials-20260923`；后续轮次新建目录，不覆盖历史。
- `.scene` 与 `.meta` 保持 UUID 稳定；sprite-frame 禁止自动 trim，防止角色脚底和大小漂移。
- Cocos 3.8.6 的 loose 构建可能假设展开目标为数组。遍历 Map / Set 时先 `Array.from`，不要直接 spread 或 for-of Map；Node 单测不会暴露此构建差异，必须验实际导出。
- 不将缓存、构建产物、node_modules 提交到源码。全屏页面处理由构建脚本完成，不只手改导出文件。
- 动作/VFX 资源与帧映射见 `assets/resources/animation`、`scripts/prepare-animation-art.py`。先逐帧验步态差异、脚底对齐与 Alpha，再验实际导出；AI 重复姿势不能算完成动作。
- 战斗表现通过 `Simulation.drainCombatEvents()` 单次消费，不能让粒子调用规则 RNG。暂停冻结所有表现；清空/重开须清理残影、死亡节点和伤害数字。
- 动作轮次证据固定在 `evidence/materials-20260923-animation` 与 `evidence/runtime-animation-20260923`。`scripts/animation-runtime-qa.mjs` 使用隔离浏览器 fixture，只用于开发，不加入正式运行入口。
- 主角跑步修正版使用 `survivor-run.png` 与 `core/RunCycle.ts`，由 `scripts/prepare-survivor-run.py` 从冻结素材派生；新证据在 `evidence/materials-20260924-run`。不能靠镜像单个整身帧“交换腿”，否则头和枪也会反向。验步态须看连贯关节、体积/上身稳定与实际位移，不能仅数换帧次数。

- 战斗地图唯一数据源是 `core/SceneMap.ts`：绘制、碰撞、寻路、视线和小地图必须共用当前 Simulation.map.obstacles（每图 LevelMap），禁止另写一套矩形挡板。地图 2400×1440，旧 1200×660 跑步 fixture 的边界断言仅为历史证据。
- 场景素材新证据在 `evidence/materials-20260924-scene`。运行 `scripts/scene-runtime-qa.cjs` 验实际导出；路径可通过 GAME_URL 配置。
- 子弹/寻路的半径扫掠须保留圆角端点检测，不能只平移凸多边形边（锐角会形成错误禁区和孤立寻路网格）。
- 弹匣、换弹与 20 类强化的规则只维护在 Simulation；R 在战斗中换弹、暂停/结算时返回营地。换弹与减速计时随模拟冻结，升级快手换弹保留完成比例，散射齐射消耗 1 发。
- 武器回归使用 `tests/weapon.test.mjs` 与 `scripts/weapon-runtime-qa.cjs`，新证据在 `evidence/runtime-weapon-20260924/`。触屏验收需按 Cocos SHOW_ALL 留白换算点击位置。移动换弹时必须优先实际步态，原地换弹全身图集只能在停步后按当前进度播放；用 `scripts/reload-motion-runtime-qa.cjs` 验三角色、移动 / 冲刺 / 撞墙、自动换弹与触屏，证据 `evidence/runtime-reload-motion-20260928/`。

- 多战区参数在 `core/Campaign.ts`；金币缩放与营地事务在 `core/Progression.ts` / `core/HeroTalents.ts`。所有购买、角色天赋解锁、道具消耗和金币入账通过 ProfileStore，并在 Web 上使用同源 Web Locks；不能以缓存 profile 覆盖其他页面的更新。`startGame` 现在是异步函数，开发 fixture 必须 await。当前存档键为 `emberline-profile-v2`，旧 `v1` 只做一次性退款迁移；不得恢复旧商店通用天赋或金币加成。
- 扩展素材证据在 `evidence/materials-20260924-expansion/`，运行证据在 `evidence/runtime-expansion-20260924/`。不得重发既有批次；本地派生脚本保留已审定的非等距分格边界。
- 扩展回归用 `tests/expansion.test.mjs` 和 `scripts/expansion-runtime-qa.cjs`。旧武器 / 场景脚本可通过 `QA_OUT` 输出新目录，保留历史截图；改布局需验 390×844 SHOW_ALL 触屏坐标与按钮尺寸。

- UI 素材轮次为 `evidence/materials-20260924-ui/`，资源 `assets/resources/ui/`；使用 `scripts/prepare-ui-art.py` 从冻结原图派生，禁止重发已有提交批次。面板九宫格四边 24px、trim none，所有 UI 文字仍由 Label 绘制。
- UI 修改运行 `scripts/ui-runtime-qa.cjs`，新截图 / 报告在 `evidence/runtime-ui-20260924/`（可用 QA_OUT 分轮）；需验桌面和 390×844 SHOW_ALL 下控件不重叠、触控边至少 44px、状态文字不压边。HUD 字号不可依赖构造时的 menu phase。

- 主角步态修复轮次为 `evidence/materials-20260928-gait/`，`scripts/prepare-roster-gait.py` 从冻结原图生成专用 `roster/*-run.png`，完整 16 帧只含移动；禁止复制混合状态图集回去或使用 `% 8`。基础图集第 8 帧与移动保持同一上身，其余攻击/倒地帧保留。验收须检查固定上身体积、交替支撑脚、首尾循环和实际导出，不能仅计数帧数。`scripts/roster-gait-runtime-qa.cjs` 与本轮三 Boss 回归写 `evidence/runtime-roster-20260928/`。

- 小 Boss / 首领追猎轮次为 `evidence/runtime-boss-pressure-20260928/`。精英波次只维护在 Campaign.eliteWaves，BossState.tier 区分两阶段小 Boss 与三阶段最终首领；最终胜利必须清理场上全部 Boss。追猎使用统一 Navigation / moveCircle；预警、加速、砸地、后摇与登场计时在模拟层，暂停 / 升级冻结。`tests/boss-pressure.test.mjs` 和 `scripts/boss-pressure-runtime-qa.cjs` 验调度、奖励、碰撞、追击、红屏与桌面 / 触屏控件不重叠。

- 英雄觉醒与构筑进化轮次为 `evidence/runtime-power-20260928/`。3 / 6 / 9 级选择强化后解锁觉醒；爆破、电弧仅主弹第一次命中触发，不能由范围伤害递归触发；爆破、电弧、新星遵守同一障碍视线。狂热中的击杀不续时。电弧表现有数量上限，暂停冻结、返回营地清空。运行 `tests/power.test.mjs` 和 `scripts/power-runtime-qa.cjs`，数据和升级预览只由 Simulation 提供。

- 爆炸修复证据在 `evidence/materials-20260928-explosion-fix/` 与 `evidence/runtime-explosion-fix-20260928/`。爆破原图实际行界为 110/582/1054/1524/1996，不能直接等分 2048。`scripts/prepare-power-vfx.py` 默认仅派生爆破：全序列共享缩放和格中心，输出 256px 帧格内保留至少 12px 透明边；禁止先放入大于 256px 的裁块再依赖 alpha_composite 隐式截断，不能逐帧按包围盒重新居中。自爆 death 事件带 detonated，表现层不叠普通死亡烟团和尸体；提前击杀保留常规奖励与倒地。运行 `scripts/explosion-runtime-qa.cjs` 验真实纹理 hash、完整序列、伤害、冻结和清理。

- HUD 布局修复证据在 `evidence/runtime-ui-layout-20260928/`。Boss / 波次 / 登场警报复用顶部第二行，不得恢复中场浮动大面板；`combatView` 统一镜头取景、小地图视窗及摇杆起始范围。`scripts/ui-runtime-qa.cjs` 验 1440×900、1068×842、390×844，包含四边角色完整可见、HUD 不侵入中央战场、Boss / 爆破 / 怪群截图及真实触控；警报显示时 Boss 血条必须隐藏。

- 英雄环形强化使用 `HeroAura.ts` / `resources/shaders/hero-aura.effect`，挂地面层、置人物下方，禁止恢复狂热图集与多层 Graphics 光圈。时间 uniform 仅使用 visualDt，不能用 `cc_time`；减弱动效静态、暂停 / 升级冻结，死亡 / 清场清空。专用 UV 载体 packable=false，切地图复用材质。`scripts/hero-aura-runtime-qa.cjs` 验真实发光像素、透明中心 / 边角、跟随 / 冻结 / 清理及 WebGL1 / 2，新证据 `evidence/runtime-hero-aura-20260928/`；强化回归同步使用 heroAura 状态。

- 弹幕使用 `ProjectileView.ts` 与 `expansion/projectile-vfx.png` 四行四帧图集；按弹芯对齐，不按尾焰包围盒居中。派生脚本 `prepare-barrage-art.py` 只读本轮冻结原图；规范与参数见 DESIGN 的弹幕章节。Boss 连射只由 `BossEncounter` 调度，预警与伤害共享 `barrageAngles`；侧方逃生缺口各波保持一致，换阶段取消待发波次。运行 `tests/boss-barrage.test.mjs`、`scripts/barrage-runtime-qa.cjs` 和 `scripts/barrage-visual-qa.py`，证据在 `evidence/materials-20260928-barrage/`、`evidence/runtime-barrage-20260928/`。

- 强化多样性轮次为 `evidence/runtime-buildcraft-20260928/`（9 月 29 日收尾）。`Simulation.UPGRADES` / `SYNERGIES` 统一维护 26 种强化、5 组联动及每局 2 次重抽；UI 不复制触发条件和实际数值。换弹震爆按开始换弹时的消耗比例判定至少半匣；冰爆不递归、跳弹不继承附加触发、猎首仅主弹积层；地雷 / 护盾 / 标记随模拟冻结并在新局清空。图鉴仅升级 / 暂停展开，维持无遮挡战斗 HUD。运行 `tests/buildcraft.test.mjs` 和 `scripts/buildcraft-runtime-qa.cjs` 验规则与实际导出。

- 角色成长轮次为 `evidence/runtime-hero-talents-20260929/`。`core/HeroTalents.ts` 是三角色双分支、6 节点、价格与前置的唯一来源；前两层最多 3 阶，末端 1 阶，购买只修改对应角色，下局开始生效。营地商城只显示角色天赋树和开局道具，旧 `vitality` / `firepower` 等通用天赋不得出现在 UI 或购买 API。金币奖励统一乘 `Campaign.COIN_REWARD_SCALE`（当前 `.68`），失败仍保留已赚金币。运行 `tests/hero-talents.test.mjs`、`scripts/hero-talents-runtime-qa.cjs` 和 `scripts/ui-runtime-qa.cjs`；迁移和双标签 fixture 必须使用隔离浏览器上下文。

- 天赋树当前入口为 `showTalentTreeV2`：桌面树与详情左右分布，手机六节点全显、详情在下方；先选 `TalentNode:<id>` 再点击详情内的 `BuyTalent:<id>`。节点框和面板从 `evidence/materials-20260929-talent-ui/` 冻结原图派生，脚本 `prepare-talent-ui-art.py`；分支牌和按钮不要切回九宫格，过小高度会压坏斜角。角色焦点必须属于当前角色，文本不进入连接线和控件区域。最终素材 hash 与截图用 `visual-talent-ui.cjs` 验证，相关规则仍在 HeroTalents / Progression。
