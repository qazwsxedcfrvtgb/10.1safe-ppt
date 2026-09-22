# 素材说明（CREDITS）

## 一、图标：Tabler Icons（MIT 许可）

界面与卡片上的所有图标都来自 **[Tabler Icons](https://tablericons.com/)**，官方仓库 <https://github.com/tabler/tabler-icons>。

- **风格**：24×24 线性图标，2px 描边、圆头端点 —— 与课件的卡通描边风格一致
- **许可**：**MIT**，可商用、可修改、**无需署名**（此处仍保留来源记录以便追溯）
- **位置**：`assets/icons/`
- **本地改动**：原始文件使用 `stroke="currentColor"`。因为图标是通过 `<img>` 加载的（无法继承父元素颜色），已把 `currentColor` 替换为对应的语义色值：
  - 交通 / 出门类 → 天蓝 `#3A9BD9`
  - 安全 / 正确 / 提示类 → 草绿 `#2A7A38`
  - 危险 / 警告 / 求助类 → 番茄红 `#E8503A`
  - 用电 / 提醒类 → 明黄 `#D99A0B`
  - 水相关 → 深蓝 `#2A7BB0`
  - 门 / 隐私 → 紫 `#7C5CD6`

### 已使用的图标

| 文件 | 用途 |
| --- | --- |
| `walk.svg` | 过马路 |
| `bike.svg` | 骑车 |
| `car.svg` | 坐车 / 乘车 |
| `pool.svg` | 野水塘 |
| `droplet.svg` | 水 / 湿手 / 湿毛巾 |
| `lifebuoy.svg` | 见人落水 |
| `bolt.svg` | 插排用电 |
| `alert.svg` | 冒烟警告 / 陌生话术 |
| `fire.svg` | 不玩火 |
| `door.svg` | 到家归位 |
| `eye.svg` | 猫眼看门外 |
| `message.svg` | 隔着门回答 |
| `phone.svg` | 打电话 / 打 119 |
| `emergency.svg` | 呼救 / 大声喊 |
| `shield.svg` | 安全 / 不跟走 |
| `gift.svg` | 不收礼 |
| `check.svg` | 做选择 |
| `star.svg` | 拿星星 |
| `bulb.svg` | 提示 / 睡前 |
| `flag.svg` | 抽号 |
| `arrow-down.svg` | 走楼梯 |
| `arrow-right.svg` | 随机事件 |

（`arrow-up.svg` 已下载但当前未使用，保留备用。）

---

## 二、插图与头像：教师提供

| 文件 | 用途 | 说明 |
| --- | --- | --- |
| `assets/open.png` | **封面右侧大图** | 卡通男孩举"假期安全记心中"牌子。原图 1728×2304 竖版，白底 |
| `assets/game.png` | **游戏人物头像** | 卡通男孩半身像。原图 2048×2048，白底 |

两张图均**未做任何修改**，原图直接引用：

- 封面：容器内 `object-fit:contain` + 底部对齐，完整显示不裁切
- 游戏头像：圆形裁切显示，CSS 放大 1.28 倍让头部填满圆框（见 `cartoon.css` 内 `.dlog .avatar` 相关规则）

---

## 三、字体

未内嵌字体文件，使用系统中文字体栈：
`Microsoft YaHei UI / Microsoft YaHei / PingFang SC / Hiragino Sans GB`

投影演示建议用 Windows 设备，可保证"微软雅黑"渲染效果。

---

## 四、已删除的素材（记录备查）

早期版本使用过以下素材，现已全部删除：

| 素材 | 原来源 | 许可 |
| --- | --- | --- |
| unDraw 插画 6 张 | [unDraw](https://undraw.co/) | 免署名、可商用 |
| DiceBear 头像 7 张 | DiceBear · Big Smile | CC BY 4.0（需署名） |
| Openclipart 卡通插画 6 张 | [Openclipart](https://openclipart.org/) | CC0 公有领域 |

其中原计划使用的 `twokidsplayingindians1913.svg`（1913 年"扮印第安人"题材，带殖民刻板印象）在下载后即被剔除，从未使用。

---

## 五、文件清单

| 文件 | 作用 |
| --- | --- |
| `index.html` | 幻灯片内容（17 页）+ 游戏页面结构 |
| `deck.js` | 放映框架：翻页、分步显示、键盘/触屏、缩略图、全屏 |
| `deck.css` | 放映框架与幻灯片基础版式 |
| `game.css` | 游戏页面基础样式 |
| `game.js` | 游戏引擎：抽号、随机成天、星制结算、班级成绩单 |
| `events.js` | 14 个安全事件数据（7 大类） |
| `cartoon.css` | 卡通风皮肤：配色、描边、圆角、字号 |
| `assets/icons/*.svg` | Tabler 图标 23 个 |
| `assets/game.png` | 游戏人物头像（教师提供） |

除图标与头像外，其余代码均为本项目自建，可自由修改。
