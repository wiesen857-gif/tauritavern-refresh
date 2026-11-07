# TauriTavern 一键刷新

在顶端栏最右侧添加一个圆形箭头按钮。点击后，等待酒馆已排队的保存完成，再重新载入整个界面，无需退出应用。

## 安装

在 TauriTavern 的「扩展 → 安装扩展」中粘贴以下地址并安装：

```text
https://github.com/wiesen857-gif/tauritavern-refresh.git
```

若安装后没有立即出现按钮，使用扩展管理器的重新载入功能。安装后不需要 Node.js、构建或额外服务。

## 使用

- 点击顶端栏最右侧的刷新图标；支持鼠标、触屏，以及 Tab 聚焦后的 Enter / 空格键。
- 手机和触屏设备上，刷新按钮保留至少 44 × 44 像素点击区域，图标无需悬停即可看清；原有顶端栏菜单紧凑排列，并为横屏刘海区域留出边距。桌面鼠标布局保持原样。
- 正在生成、聊天正在保存、消息编辑尚未结束或输入框有未发送内容时，会提示先完成当前操作。
- 等待保存时按钮暂时禁用。保存失败会保留当前页面，并显示错误；可以处理后重试。
- 刷新会重新加载前端和扩展，不会重启 Tauri 原生进程，也不会清除聊天或缓存。
- 未提交的设置表单等临时界面状态不保证保留；刷新前请先完成编辑。

通过扩展管理器禁用或卸载本扩展后重新载入，按钮即可移除。

## 兼容性与验证

面向 TauriTavern 2.4.0。使用宿主提供的 `/script.js` 生成状态，以及 `/tauri/main/services/lifecycle/lifecycle-flush-service.js` 的 `flushLifecycleState(reason)` 保存队列。不支持普通 SillyTavern，不提供跳过保存的强制刷新。

接口与顶端栏结构于 2026-11-07 核对，参考版本为 [TauriTavern fff9af0](https://github.com/Darkatse/TauriTavern/tree/fff9af0333be97697be2313981699ab0ce35c236)：`src/script.js`、`src/index.html`、`src/style.css` 和 `src/tauri/main/services/lifecycle/lifecycle-flush-service.js`。本机应用文件版本为 2.4.0；自动化测试在隔离 Chromium 中运行，宿主状态和保存结果使用替身。1.1.0 增加了 320–430 像素竖屏、844 像素横屏、触摸刷新和触摸保存失败测试。尚未在实体 Android / iOS 设备中验证，也不保证所有第三方主题的自定义布局。

已安装用户：在扩展管理器中更新「一键刷新」到 1.1.0，然后重新载入。

开发验证（安装扩展无需执行）：

```sh
npm install
npx playwright install chromium
npm run check
npm test
```

测试也可通过环境变量 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定已安装的 Chromium。本机验证使用此方式；该变量只用于测试，不影响扩展运行。
