# 国家、地区与时间线数据

本项目用独立公开数据重新建立模拟参数。172 个可选地理项的 ISO 风格代码与中文名称用于兼容参考游戏的选择范围；没有复制参考站的统计表、事件文案或模拟代码。该范围包含国家与地区，不代表世界全部地理项，随机出生的权重会在这 172 项内重新归一化。

## 来源与许可

主要数据来自世界银行 **World Development Indicators（WDI，source=2）**。取数上限统一为 2024 年，当前快照对每个指标选取 **2015–2024 年内最近的非空观察值**，并非所有字段都来自同一年。

- [WDI 官方目录与 CC BY 4.0 许可](https://datacatalog.worldbank.org/search/dataset/0037712/world-development-indicators)
- [世界银行数据许可规则](https://datacatalog.worldbank.org/public-licenses)
- [官方 V2 API 文档](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation)
- [地理与区域分类元数据](https://api.worldbank.org/v2/country/all?format=json&per_page=400)
- [指标与原始提供机构元数据](https://api.worldbank.org/v2/indicator?source=2&format=json&per_page=20000)

署名：**World Bank, World Development Indicators，及各指标所列原始提供机构。** 项目进行了中文名称本地化、百分比归一化、年度出生权重推算、缺失值替代、时间插值与游戏情景建模。指标的原始机构说明、下载 URL、数据更新日期保存在 `src/simulation/countries.json` 的 `sources` 中；每项数据的实际年份与替代原因见该文件各行的 `sourceYears`、`imputed`。项目没有声称这些数值与参考游戏使用的联合国数据相同。

## 字段与单位

每个 WDI 指标可由以下 URL 模板重新获取完整 1960–2024 年序列：

`https://api.worldbank.org/v2/country/all/indicator/{指标代码}?date=1960:2024&format=json&per_page=20000&source=2`

| 游戏字段 | WDI 指标 | 单位与处理 |
| --- | --- | --- |
| `population` | `SP.POP.TOTL` | 人；不是千人 |
| `births` | `SP.POP.TOTL` × `SP.DYN.CBRT.IN` / 1000 | 推算年度活产人数；用于出生权重，不是原始活产统计 |
| `lifeExpectancy` | `SP.DYN.LE00.IN` | 出生时预期寿命，年 |
| `femaleLifeExpectancy` | `SP.DYN.LE00.FE.IN` | 女性出生时预期寿命，年 |
| `maleLifeExpectancy` | `SP.DYN.LE00.MA.IN` | 男性出生时预期寿命，年 |
| `infantMortality` | `SP.DYN.IMRT.IN` | 每千活产婴儿在满一岁前死亡数；使用时须除以 1000 |
| `gdp` | `NY.GDP.PCAP.PP.CD` | 按购买力平价折算的人均 GDP，现价国际元；不是个人工资 |
| `urban` | `SP.URB.TOTL.IN.ZS` | 城镇人口比例，由百分比除以 100，范围 0–1 |
| `fertility` | `SP.DYN.TFRT.IN` | 每名女性平均生育数 |
| `education` | `SE.SEC.ENRR` | 中等教育毛入学率 / 100，再限制为 0–1 的游戏机会指数；不是毕业率或个人入学概率 |

`births` 两个输入可能来自不同观察年份；原始年份分别保存在 `sourceYears.population` 与 `sourceYears.birthRate`。毛入学率可高于 100%，限制上界是游戏处理，不应当用于统计分析。

## 缺失值与台湾补充

缺失指标优先采用同年窗口内的世界银行区域汇总，再采用世界汇总；绝对人口缺失时采用可用区域地理项的中位数，避免用世界人口替代某一地理项。无可用历史 GDP PPP / 入学率时，使用最新可用值按下面的明示趋势构造历史游戏代理值。每项替代都标记在 `imputed` 中。

台湾不在该 WDI 国家时间序列中，因此补充独立的 2024 年官方数字：

- 人口 **23,400,220**，登记活产 **134,856**：[内政部 2024 冬季人口统计季刊，第 6 页英文分析](https://www.ris.gov.tw/documents/data/5/2/DemographicQuarterly_Winter2024.pdf)。这是户籍登记口径；可能与按发生时间统计的出生数不同。
- 总体 / 男性 / 女性出生时预期寿命 **80.77 / 77.42 / 84.30** 年：[内政部 2024 年简易生命表说明](https://www.moi.gov.tw/News_Content.aspx?n=4&s=330934&sms=9009)。
- 婴儿死亡率 **4.5 / 千活产**：[卫生福利部死因统计表 7，2024 行](https://www.mohw.gov.tw/dl-63149-220bd4b6-a814-4591-98c0-6eb5458def59.html)。
- 总生育率 **0.885**：[立法院对官方总生育率的整理](https://www.ly.gov.tw/Pages/Detail.aspx?nodeid=6590&pid=250109)。

台湾缺少的 GDP PPP、城镇化、入学率使用 WDI 高收入经济体汇总代替，并逐项标注 `regional proxy: HIC`；这些字段不应展示为台湾实测值。台湾历史人口等缺失项也有相应替代标记。

## 时间线模型

JSON 为每项地理数据保存 **1960、1980、2000、2015、2024** 五个锚点。1960–2015 锚点优先采用该年或之前最多五年内的最近观察值；2024 锚点允许向前查到 2015 年。锚点之间做线性插值，因此游戏年份值不等于逐年原始观察。历史 GDP PPP 缺失时，使用最新代理值按每年 1.5% 向前折减；早期入学率完全缺失时，按每年 0.8% 向前折减。这些是游戏假设。

`countryAt(id, year, world)` 对 1800–2200 的年份返回连续、有限的游戏参数：

- 1960 年前：以 1960 锚点为起点，人口每年 1%、GDP 每年 1.5% 向前折减；预期寿命每年前移减少 0.18 年；其余指标使用下面同一情景变化公式。没有假装拥有 1800 年的观测数据。
- 2024 年后：以当前快照为起点，人口每年 0.3%、GDP 每年 1.8% 增长；预期寿命每年增加 0.12 年；婴儿死亡率每年按指数减少 1.5%；城镇比例每年增加 0.0015；教育指数每年增加 0.002；生育率每年减少 0.008。出生权重按人口与生育率变化缩放。
- `world = present` 对整个人生固定使用 2024 当前快照，不受传入年份影响。`world = past` 使用历史插值，越过 2024 年后按 0.7 倍速度演化；`world = future` 按 1 倍速度演化。寿命、比例、生育率等有明确上下界。

这些是可复现的娱乐模拟情景，不是世界银行或联合国人口预测。历史国界、战争、制度变化、迁移与宏观经济冲击需要事件引擎另行处理；各年代使用相同的地理选择集合。个人寿命与生活结局也不由国家均值直接决定。

## 抽样与可复现性

`sampleCountry(seed, 'birth')` 按当前年度出生权重抽样；`sampleCountry(seed, 'population')` 按当前人口抽样。整数种子通过独立确定性混合函数映射为 0–1 分位数，API 内不调用 `Math.random`。相同种子与模式返回相同地理项。未知 `countryById` 参数回退到 `CHN`，以兼容旧存档。

## 本次数据核验

当前数据包有 **172 个唯一代码、860 个快照与历史锚点**；10 个指标均保留原始机构元数据。当前快照有 **21 项地理数据的 23 个字段**采用显式代理值。当前人口权重总和为 **8,131,702,242** 人，年度出生权重总和为 **132,371,370**；它们是支持集合内的合计，不等于全球官方合计。

已核验所有数值有限、人口与出生权重为正、比例位于 0–1；TypeScript 类型检查与模块 ESLint 通过。对全部地理项验证了 12 个年份 / 非法年份输入和 3 种世界情景，共 **6,192** 组返回值；100,000 个确定性种子的两种权重抽样通过分布偏差检查。
