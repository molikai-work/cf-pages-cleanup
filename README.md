# cf-pages-cleanup
使用 GitHub Actions 批量删除 Cloudflare Pages 的所有旧的部署记录。

> 基于 [delete-all-deployments](https://pub-505c82ba1c844ba788b97b1ed9415e75.r2.dev/delete-all-deployments.zip) 项目修改

## 介绍
众所周知，在 Cloudflare Pages 上当您删除一个项目时，如果这个项目的部署记录超过了约 100 个，那么您很有可能会无法删除该项目。

[已知问题 · Cloudflare Pages](https://developers.cloudflare.com/pages/platform/known-issues/#delete-a-project-with-a-high-number-of-deployments)

不过 Cloudflare 官方也提供了一种解决方法，那就是使用他们的程序来批量删除部署，参见上面链接的内容。

不过我觉得这样子有点麻烦，于是就有了这个项目，支持使用 GitHub Actions 来批量删除 Cloudflare Pages 的所有旧的部署记录，  
另外还进行了翻译、添加新功能等等，让我们开始使用吧。

## 使用
这非常简单，您只需要分叉此仓库，然后在您分叉的仓库的 Actions 页面启用工作流，  
然后进入仓库 Settings 页面，在左侧边栏的 Security 项下找到 Secrets and variables，然后进入 Actions，  
添加 Secrets，分别是：`CF_ACCOUNT_ID`、`CF_API_TOKEN`、`CF_DELETE_ALIASED_DEPLOYMENTS`，  
- `CF_ACCOUNT_ID`：您的 Cloudflare 账户 ID
- `CF_API_TOKEN`：您的 Cloudflare API Token，需要有账户 Cloudflare Pages 的编辑权限
- `CF_DELETE_ALIASED_DEPLOYMENTS`：是否删除绑定了别名的部署，布尔值，默认不启用

---

然后在 Actions 页面选择“清理 Cloudflare Pages 部署”这个工作流，  
点击 Run workflow 这个按钮，然后在输入框中填入您要删除历史部署记录的 Cloudflare Pages 项目名称（支持一次设置多个，以半角逗号隔开），  
最后再点击 Run workflow 按钮即可，您可以进入工作流运行页面查看运行输出日志。
