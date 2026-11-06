# TuMei API 视频插件接入

面向自己的new-api面板，使用tumeiapi.com的用户API Key调用本站视频模型。

1. 导入plugin-upload.json并激活comfyui-video 1.9.7。
2. 按downstream-channel-template.json填写本站Base URL和用户Key，使用type 60与task_extend_plugin_keys=["comfyui-video"]。
3. 配置自己面板的模型权限、分组及售价。本包不覆盖现有自定义价格。
4. 用户调用自己面板的/v1/videos，保存返回ID；同一面板查询/v1/videos/{id}，完成后带Key下载/v1/videos/{id}/content。

本站Base URL：https://tumeiapi.com
接口及全部示例：https://fastaiapi.cloud/help/magic-video/
模型参数：gpu-video-api.md

平台自动完成模型接入；普通调用者只需选择公开模型ID和生成参数。
可选metadata.resource_account_key仅用于已经登记授权的自有资源，不是云账号Token。
创建响应不确定时先核对原任务，不自动重复创建。已获得ID时继续查询原任务。
