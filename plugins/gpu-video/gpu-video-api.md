# 兼容视频模型与调用参数

Base URL：`https://tumeiapi.com`。所有创建、查询与下载均使用本站用户Key。选择公开模型即可，不需要提供其他接入信息。

| 模型 | 时长（整数秒） | 生成方式 | 规格 |
| --- | --- | --- | --- |
| `minimax-h3` | 5–15 | 文生视频 / 首帧 / 首尾帧 / 参考生视频 / 加速文生 | 480p / 768p / 1080p |
| `minimax-h3-u24` | 5–15 | 文生视频 / 参考生视频 | 480p / 768p / 1080p |
| `minimax-h3-u32` | 5–15 | 文生视频 / 参考生视频 | 480p / 768p / 1080p |
| `minimax-h3-u17` | 5–15 | 文生视频 | 480p / 768p / 1080p |
| `wan2.2` | 1–15 | 首帧 | 480 / 768 / 1024 / 1280 / 1536 |
| `ltx-2.3` | 1–15 | 首帧 | 480p / 768p / 1080p |
| `ltx-2.3-grid` | 4–15 | 四宫格 | 512p / 768p / 1024p |
| `ltx-2.3-avatar` | 5–15 | 数字人 | 576p |
| `minimax-h3-x` | 2–15 | 文生视频 / 首帧 / 首尾帧 / 参考生视频 / 首尾帧+参考素材 | 480p / 768p / 1080p |
| `ltx-2.3-x` | 1–15 | 首尾帧 | 448p / 704p / 1088p |
| `wan2.1` | 1–15 | 文生视频 | 480p / 768p / 1088p |

## 通用字段

`model`、`prompt`必填，`seconds`是输出时长，`size`是宽x高。`input_reference`是首帧，`metadata.last_frame_url`是尾帧。`metadata.reference_images`、`metadata.reference_audios`、`metadata.reference_videos`分别是人物/场景图片、声音和动作视频参考，按型号支持范围传递。

H3常用864x480、1376x768、1920x1088，竖屏交换宽高。LTX X宽高按64对齐，其他H3/LTX按32对齐。Wan2.2使用metadata.resolution长边档位480/768/1024/1280/1536，实际尺寸跟随首帧比例，不同时传size。

数字人需要人物图与覆盖生成时长的完整配音。U17仅文生；U32不支持参考声音；只有H3 X支持参考视频与Hybrid组合。

## 请求示例

以下JSON作为POST /v1/videos请求体；携带Authorization: Bearer YOUR_TUMEIAPI_KEY。素材URL需要替换为真实公网直链。

### 文本生成与分辨率

minimax-h3-u24可替换为minimax-h3-u32或minimax-h3-u17；逐项按模型表选择支持的素材。

```json
{
  "model": "minimax-h3-u24",
  "prompt": "红色小球在木桌上缓缓滚动，镜头固定。",
  "seconds": 5,
  "size": "864x480"
}
```

### H3首尾帧



```json
{
  "model": "minimax-h3",
  "prompt": "人物从首帧位置向前走，结束画面与尾帧一致。",
  "seconds": 5,
  "size": "864x480",
  "input_reference": "https://cdn.example.com/first.jpg",
  "metadata": {
    "last_frame_url": "https://cdn.example.com/last.jpg"
  }
}
```

### H3人物图与参考声音

U32可以参考图片，但不能传reference_audios；U17只接受文本。

```json
{
  "model": "minimax-h3-u24",
  "prompt": "保持图1的人物形象，参考音频1的声音进行讲述。",
  "seconds": 5,
  "size": "864x480",
  "metadata": {
    "reference_images": [
      "https://cdn.example.com/person.jpg"
    ],
    "reference_audios": [
      "https://cdn.example.com/voice.mp3"
    ]
  }
}
```

### H3加速文生

加速方式只用于文生，不与首帧或参考素材组合。

```json
{
  "model": "minimax-h3",
  "prompt": "日落时分，一只纸船缓缓漂过湖面。",
  "seconds": 5,
  "size": "864x480",
  "metadata": {
    "variant": "fast"
  }
}
```

### H3 X首尾帧与参考素材组合

首尾帧约束和人物/动作参考分别提供，不能把同一参考角色图默认为尾帧。

```json
{
  "model": "minimax-h3-x",
  "prompt": "保持图1的人物外观，参考视频1的步态，从首帧走到尾帧。",
  "seconds": 5,
  "size": "864x480",
  "input_reference": "https://cdn.example.com/first.jpg",
  "metadata": {
    "mode": "ref2va",
    "last_frame_url": "https://cdn.example.com/last.jpg",
    "reference_images": [
      "https://cdn.example.com/person.jpg"
    ],
    "reference_videos": [
      "https://cdn.example.com/motion.mp4"
    ]
  }
}
```

### Wan首帧与长边档位

此型号按参考图比例输出。480表示长边档位，不是固定480×288；不需要同时传size。

```json
{
  "model": "wan2.2",
  "prompt": "画面中的小船缓缓前行，保持画面稳定。",
  "seconds": 5,
  "input_reference": "https://cdn.example.com/first.jpg",
  "metadata": {
    "resolution": 480
  }
}
```

### Wan文本生成

不支持图片、音频或视频参考；成片没有音轨。

```json
{
  "model": "wan2.1",
  "prompt": "一只纸船漂过平静的湖面。",
  "seconds": 5,
  "size": "832x480",
  "metadata": {
    "fps": 16
  }
}
```

### LTX首帧音画



```json
{
  "model": "ltx-2.3",
  "prompt": "人物沿林间小路缓步前行，镜头跟拍。",
  "seconds": 5,
  "size": "768x448",
  "input_reference": "https://cdn.example.com/first.jpg",
  "metadata": {
    "fps": 30
  }
}
```

### LTX四宫格

上传一张2×2四宫格图片，画面依次为左上、右上、左下、右下；不是四张独立参考图。

```json
{
  "model": "ltx-2.3-grid",
  "prompt": "按四幅画面的顺序，表现人物进入庭院、停下、转身、离开的过程。",
  "seconds": 4,
  "size": "512x512",
  "input_reference": "https://cdn.example.com/grid-2x2.jpg"
}
```

### LTX数字人配音

提供一张人物图和一段覆盖生成时长的完整配音；不是仅提供一小段音色样本。

```json
{
  "model": "ltx-2.3-avatar",
  "prompt": "人物正对镜头自然讲述，面部表情柔和。",
  "seconds": 5,
  "size": "576x1024",
  "input_reference": "https://cdn.example.com/presenter.jpg",
  "metadata": {
    "reference_audios": [
      "https://cdn.example.com/speech.mp3"
    ]
  }
}
```

### LTX X首尾帧

宽高按64对齐，此型号使用25fps；不要套用其他LTX变种的默认值。

```json
{
  "model": "ltx-2.3-x",
  "prompt": "从清晨的花园平稳移动到尾帧中的凉亭。",
  "seconds": 5,
  "size": "768x448",
  "input_reference": "https://cdn.example.com/first.jpg",
  "metadata": {
    "last_frame_url": "https://cdn.example.com/last.jpg",
    "fps": 25
  }
}
```

## 查询与保存

创建成功后保存id，每20秒或更长间隔GET /v1/videos/{id}。状态为queued、in_progress、completed、failed。完成后通过GET /v1/videos/{id}/content并携带本站Key下载。创建超时后先核对控制台，不能自动重复付费请求。

完整支持清单、标准请求与插件安装：https://fastaiapi.cloud/help/magic-video/
