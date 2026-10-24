# 公开试玩与完整模型版

[公开试玩](https://lancerlsy.github.io/life-crossroads/)无需安装，可直接抽签出生、经历人生、进行本地对话、管理关系与回看时间线。存档保存在访客自己的浏览器中；试玩网址与本机版本分别保存，可通过备份文本或文件转移。

试玩采用GitHub Pages静态托管，明确显示“本地故事”。该构建不会请求`/api/*`，不包含模型密钥，也不调用开发者电脑上的DeepSeek服务。自由模型对话和主动年度人物分析需要运行完整Node版本并配置自己的服务端密钥，见项目首页。

## 构建

```sh
npm ci
npm run build:pages
npm run preview:pages
```

本地预览地址为 http://127.0.0.1:4173/life-crossroads/ 。静态文件写入`dist-pages/`，完整模型版仍写入`dist/`。`pages`构建模式处理仓库子路径及出生背景图片路径，两个构建都由`.gitignore`排除。

`.github/workflows/pages.yml`在main更新时执行完整检查，再构建试玩、上传静态产物并部署。构建任务只读源码与Pages配置；部署任务单独持有Pages及OIDC权限。模型凭据不参与此流程。

发布方式按[Vite部署说明](https://vite.dev/guide/static-deploy.html#github-pages)和[GitHub Pages文档](https://docs.github.com/en/rest/pages/pages)配置。其他仓库或自定义域名需要相应调整`vite.config.ts`中的公开路径。
