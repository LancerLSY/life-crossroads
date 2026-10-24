# 像素美术来源

生活场景中的人物、住宅、天空、街道、树木、道具和纪念场景由 `src/pixel/scene.ts` 的独立整数像素绘制代码产生。

- `PixelScene.tsx`：原生192×60生活场景，最近邻显示。人物、房屋、地区、年龄、心情、职业、家庭和结局都来自游戏状态。
- `PixelPortrait.tsx`：原生24×32人物肖像，与场景共享姓名外观种子。
- `public/favicon.svg`：本项目原创的小型像素人物图标。
- 分享卡：将本作像素画布嵌入本地SVG，姓名与文字经过转义，再在浏览器内导出PNG。
- 虚构危机支线：沿用192×60像素画布绘制暗室、高窗和主角，暂停家庭人物热点；脱险后恢复生活场景，死亡后显示纪念场景，无血腥图像。

原站的发布文件仅用于临时分析和本地参考，不随仓库分发。旧手绘资源已从当前版本移除，可在早期Git历史中查看。

## 人生卡试玩二维码

`src/lib/playLinkQr.json`是固定公开试玩地址的二维码矩阵，只包含地址和43×43的黑白模块行，四周保留5模块白色静区。生成时使用macOS自带的[Core Image二维码生成器](https://developer.apple.com/documentation/coreimage/cifilter-swift.class/qrcodegenerator%28%29)，并用[Vision条码识别请求](https://developer.apple.com/documentation/vision/vndetectbarcodesrequest)读取[解码文本](https://developer.apple.com/documentation/vision/vnbarcodeobservation/payloadstringvalue)；按2、4、10倍整数放大后均解码为`https://lancerlsy.github.io/life-crossroads/`。矩阵各行以换行符连接后的SHA-256为`a99459c6b33a8af1423d4ae3cf56f429bdf1e404bb4c3354ba9496515a81b53a`，测试锁定地址、模块形状和静区。

浏览器运行时直接将已生成矩阵绘制为SVG整数路径，与本作场景一起导出PNG；二维码不由模型绘制，不请求二维码服务，也不包含存档、聊天或密钥。可选的重新生成与解码验收需要macOS上的Core Image和Vision；日常安装、构建和游玩不需要Apple框架或额外二维码依赖。试玩地址改变时应重新生成矩阵、更新回归校验，并重新验证实际导出图片的扫码结果。

## 出生抽签背景

`public/assets/birth-world.png` 是本轮用内置 Image Gen 生成的独立像素背景，1536×1024。由配套抽签界面概念继续生成：星空中的蓝绿色地球、两侧城镇与湖面，下方保留空间给真实纸签与按钮。最终素材不含文字、按钮或抽签结果。它只用于出生抽签舞台；姓名、概率、年代、纸签、控件和揭晓逻辑全部为可交互组件。已有程序像素头像与生活场景保留，用于反映真实人物和存档状态。

生成提示要点：严格16位像素风、深蓝星空、蓝绿色地球、白色像素云、左侧山城和右侧城镇、平静的下部湖面，无文字、无界面边框、无水彩或3D样式。

## 对外预览素材

`docs/media/otherlife-cover.png`为1280×720项目封面，直接使用本作渲染器产生的32岁生活场景，加上项目名和玩法介绍。`docs/media/life-stages.gif`展示同一条本地模拟人生在0、6、18、32、70岁时的场景，均由`renderScene(deriveSceneModel(...))`输出，再以最近邻放大；没有使用玩家存档或真实个人信息。文字与边框是宣传排版，封面不冒充完整游戏截图。

`docs/media/causality-demo.png`及`causality-demo.gif`为合成玩法情景演示：2025年提出家庭相册计划，2026/2027两次年度回顾未推进，真实DeepSeek调用返回“被冷落”的判断，本地规则结算亲密82→80、信任84→83。人物均为独立验收生成的虚构角色，场景和肖像来自本作渲染器；排版为说明性演示，不是游戏界面截图或真实玩家证言。素材明确说明“本地规则；完整版可选DeepSeek分析”，没有把在线试玩描述为已接入共享模型。

`docs/media/share-card-example.png`使用固定种子918生成的虚构角色“王时安”，将本作生成的卡片SVG放在方形外框中完整渲染，保留用于预览的左右留白。该全图及640像素缩略图均通过Vision解码验证，二维码指向公开试玩地址。
