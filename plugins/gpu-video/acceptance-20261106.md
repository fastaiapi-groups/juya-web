# AutoDL RTX 5090 · NewAPI 实机验收（2026-11-06）

验收链路为调用方 → NewAPI（comfyui-video 1.9.6）→ Go Wrapper → RTX 5090。以下 19 次成功任务均经 NewAPI 查询与鉴权内容接口下载，并用 ffprobe 检查实际文件；覆盖 9 个公开 AutoDL 模型。原始请求、失败迭代、媒体文件和探测记录保存在服务器受限备份中，不把凭据或私有素材放入 Git。

| 场景 | 模型 | NewAPI 任务 ID | 实测尺寸 | 秒数 / FPS | 音轨 |
| --- | --- | --- | --- | --- | --- |
| h3-fast | `minimax-h3` | `task_T6YjR78cv2kxlFyrI4UKxh3fTdxri7xQ` | 864x480 | 5.0s / 24/1 | AAC |
| h3-first-last-v2 | `minimax-h3` | `task_xsZpOuztle8TFZkRFBsnsLGWrQD0rKB7` | 864x480 | 5.0s / 24/1 | AAC |
| h3-first-v2 | `minimax-h3` | `task_m8fJodtYTv05xPEKHbKeqVZMrfXUjHd6` | 864x480 | 5.0s / 24/1 | AAC |
| h3-multipart | `minimax-h3` | `task_dHyS9U4dmvVTdoxLYRC0LlJechQd19ma` | 864x480 | 5.0s / 24/1 | AAC |
| h3-reference-v2 | `minimax-h3` | `task_ddcJ3TwTZvfzH19yllQcp5TFGD6lG1yt` | 864x480 | 5.0s / 24/1 | AAC |
| h3-text | `minimax-h3` | `task_VyfLx7yzlrNUmjPkPo9gf9ZR3qtqN6Cz` | 864x480 | 5.0s / 24/1 | AAC |
| ltx-avatar-v2 | `ltx-2.3-avatar` | `task_sNsGjMs7uBvwPfeRCkfRHhq22zm9u67O` | 576x1024 | 5.0s / 30/1 | AAC |
| ltx-first-v3 | `ltx-2.3` | `task_KSWGjSmhqpJmcLdEiOOaPooFEqoZZjy9` | 640x384 | 1.0s / 30/1 | AAC |
| ltx-grid-v4 | `ltx-2.3-grid` | `task_kO0YF2FvHOcGsb0NRf32AuvVmgtPRKkG` | 512x512 | 4.0s / 24/1 | AAC |
| u17-text | `minimax-h3-u17` | `task_uMS8jsnlKWk0I12PWzCEcXddQDqshOga` | 512x288 | 5.0s / 24/1 | AAC |
| u24-768p-duration6 | `minimax-h3-u24` | `task_WJEqnwCyU4K9Aeuxb7LHSxswCDay8VzW` | 1376x768 | 6.0s / 24/1 | AAC |
| u24-reference-audio-v2 | `minimax-h3-u24` | `task_UYqySzwqWAC6xWvas7bP8tWBYro7DhpU` | 864x480 | 5.0s / 24/1 | AAC |
| u24-text-v2 | `minimax-h3-u24` | `task_0uPSqLPLaOTu7R28rzm1juAqLxiue7BY` | 864x480 | 5.0s / 24/1 | AAC |
| u32-reference-v2 | `minimax-h3-u32` | `task_Nvzxs4pYm3LoLc1DdYC97mhMJC6uSyVO` | 480x864 | 5.0s / 24/1 | AAC |
| u32-text | `minimax-h3-u32` | `task_34Cycj1xLbBJ9zFclj3Al9nGFlRKXqi2` | 480x864 | 5.0s / 24/1 | AAC |
| wan21-native | `wan2.1` | `task_JKsYE46z6k2NoQQycpLxwiCFjwCgDGfF` | 512x288 | 1.0s / 16/1 | 无 |
| wan21-shared-pool | `wan2.1` | `task_y8J2XiHDB4OHfgEznwgakplQyWoLcBnX` | 512x288 | 1.0s / 16/1 | 无 |
| wan22-first-v2 | `wan2.2` | `task_beiv3Y9fySYbimaGb3hughBkNcSQHMic` | 480x272 | 1.0s / 16/1 | 无 |
| zizi-entry | `minimax-h3-u17` | `task_duaU19k3vSZ3HzMTn0GeQ8PctLfLF3yn` | 864x480 | 5.0s / 24/1 | AAC |

## 参数与接口核对

- H3 首帧、首尾帧、多参考图；U24 参考图和音频；U32 参考图分别完成，不把人物参考图自动改成首帧或尾帧。
- 768p 案例仅在 metadata 提供 duration=6、resolution=768p，最终成片为 1376×768、6 秒；插件根据最终有效参数计算数量与分辨率档位，管理员售价保持原配置。
- multipart 输入 PNG 通过同一 NewAPI 接口提交。显卡实际收到的输入文件经读取核验为 JPEG，文件头 ffd8ffdb，非仅修改扩展名。
- Wan 2.2 的 480 档实测为 480×272，按原图比例决定，不强制伪装成固定 480×288。
- 四宫格使用面板 Comfy 代理保留完整动态图参数，按四象限引导帧生成；数字人使用人物图与覆盖时长的音频。
- Wan 2.1 原生与面板代理两条路径都通过实测；正式面板路径在原资源池中串行执行，共用实例租约，不建立争用同一张卡的独立队列。
- NewAPI 内容接口 HEAD 返回 200，Content-Length 正确；Range bytes=0-1023 返回 206、1024 字节及正确 Content-Range。
- 小数时长、尺寸与档位冲突、n=2、U17 带图片、U32 带音频、Wan 2.2 缺首帧 6 类输入全部返回 400/422，没有生成任务 ID，未派发显卡。

## 修复与恢复

面板的模板参数和动态图结构已发生变化。完成完整模板绑定、固定图连接校验、当前 LTX 四引导帧映射、正确文件上传路径、JPEG 转码与原生工作流复用。提交 HTTP 500 的旧四宫格记录保留；先核对原任务、上游历史和队列，再由管理端确认未受理，旧记录标记失败后才另建新任务，没有自动重复生成。

生产控制数据保存在 PostgreSQL；升级使用持久任务及原上游 ID 继续查询。本轮已在多个应用版本间发布，原任务记录不重置。只读核对历史任务的状态、开始/结束时间、上游 ID 与实例关联。

## 插件与验证范围

统一字字动画插件 1.1.0 包含原魔法视频和 GPU 模型，按 Key 权限列出模型，按模型显示生成方式、时长、FPS、分辨率与参考素材；SDK generate 入口使用公网 tumeiapi.com 真正创建、查询并保存成片，任务见 zizi-entry。界面切换通过 SDK 测试，官网插件下载区已在本机 Chrome 打开检查。没有把 SDK 入口实测表述为在未提供的字字动画宿主内完成全界面操作。

NewAPI 插件 1.9.6 经实际 NewAPI CLI lint / 9 个协议案例与下游 NewAPI 转发契约验证；平台直连路径完成上述真实生成。下游 NewAPI 模式使用公开模型名与自己的任务 ID，附可导入 JSON 和 type 60 渠道模板；本轮没有另部署下游面板再跑付费任务。

Go 完整 PostgreSQL race 测试、vet、管理 UI 测试通过；官网 41 项集成测试、插件 13 项 Python 客户端测试与动态 UI 测试通过。AutoDL 自动抢卡此前已观测缺货状态下约 20 秒重试；重启恢复、用户隔离与开关机策略另有模拟测试，本轮不再次关机抢库存。

按用户最新指令，RTX 5090 保持运行，AutoDL 平台池 auto_stop=false；自动开机/租用策略保留，最大 1 张 RTX 5090。未执行关机、销毁或更换规格。未重新测试所有分辨率与时长组合、视觉一致性评分、用户自有 AutoDL 实租流程；仙宫云渠道沿用此前单独验收记录。

业务代码提交：48494cbcccc54c2aa47798250c24b3558abb7e11；NewAPI 插件 SHA-256：6c7360782ee32d727217f2e192fbff272f41ca3b4bc8834dcd9836b40b463da9。
