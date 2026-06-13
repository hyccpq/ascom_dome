# PCB2 布线收尾清单

本文记录 ESP32-S3 平移顶控制板 `PCB2` 的剩余布线工作，方便 JLCEDA 客户端恢复后继续按同一个方向收线，不重复走弯路。

## 目标

- 2 层板，尺寸控制在 `100 mm x 100 mm` 内。
- 四角预留 M3 非金属化安装孔，孔径约 `3.2 mm`。
- 电源、继电器干接点、限位输入、雨感输入、RS485 预留都靠板边用接线柱引出。
- V1 主控制链路使用 `OPEN`、`CLOSE`、`STOP` 三路继电器干接点。
- RS485 仅预留，`R8 120R` 终端电阻在 V1 默认 DNP。

## 当前稳定基线

JLCEDA 客户端卡死前，最后一次稳定 DRC 为：

```text
Connection Error: 31
GND: 21
3V3: 4
OPEN_COIL_LOW: 2
RS485_A: 2
RS485_B: 2
```

该基线没有 clearance 或 physical 类 DRC 错误。

KiCad 离线备份板已经进一步整理，当前 DRC 状态为：

```text
短路/交叉/clearance/hole-clearance/solder-mask-bridge: 0
未连接: 0
严格错误检查: 0
完整 DRC 警告: 34 条 lib_footprint_mismatch
```

已补充内容：

- `J9 USB-C DEVICE`：ESP32-S3 原生 USB 下载/调试口，VBUS 接 5V，D+/D- 接 MCU USB 引脚，CC1/CC2 各用 5.1k 下拉。
- `J1 5V IN`：外部 5V 接线柱保留，并补充 `GND +5V IN` 丝印。
- 三路 GPIO 到栅极电阻、三路继电器线圈、U2 GND、K1 5V 等上一轮未连接项已收线。

剩余问题不是电气未连接，而是生产化整理：

- 自定义 `Codex:*` 占位 footprint 需要替换成真实 JLCEDA/KiCad 库封装。
- USB-C 需要按实际采购连接器核对外壳脚、定位孔、板边开口和装配方向。
- 当前 KiCad 预览和 Gerber/Drill 草包已经导出到 `hardware/kicad/out/`，仅用于检查层、孔、边框和布线，不建议直接下单。

## 不要重复的尝试

- 不要只在 PCB 端删除 `R8`。这样虽然能少一个 BOM 元件，但如果原理图没有同步删除或同步改 DNP，会产生 PCB/原理图网表不一致。
- 不要在当前 R1/5V/GPIO 密集区直接拉 `OPEN_COIL_LOW` 的 Q1-D1 横线；之前尝试会触发间距错误。
- 不要强行让 3V3 长线穿过 U2/R8/C2 密集区；如果要走这一路，先移动 R8 或 C2。

## 下一轮布线顺序

1. 先恢复 JLCEDA 客户端响应，确认当前文档是已保存的稳定基线，还是残留了未保存的 R8 实验状态。
2. 如果出现 `Netlist Error`，优先处理网表一致性：要么撤回 PCB 端 R8 删除，要么原理图和 PCB 同步删除/同步 DNP。
3. 将 KiCad 离线版新增的 USB-C、5V 输入丝印和收尾走线同步回 JLCEDA。
4. 替换占位 footprint：
   - 接线柱统一一个系列和间距。
   - USB-C 选低成本 16P/24P 常规母座，按供应链封装落地。
   - 继电器、AMS1117、MAX3485、AO3400A、二极管和 0603/0805 阻容全部换成可采购封装。
5. 生产化检查：
   - 先保证 clearance/physical 错误为 0。
   - 再确认 connection error 为 0。
   - 最后整理丝印、端子名称和装配可读性。

## 成本决策

- 保持 2 层板。
- 接线端子尽量统一间距和系列。
- 继电器 V1 只引出 `COM/NO`，现场明确需要 `NC` 再扩展。
- RS485 终端电阻、偏置电阻和保护器件默认作为可选/DNP 位。
- 如果要从 BOM 删除可选器件，必须同步更新原理图和 PCB，保证 DRC 仍有意义。
