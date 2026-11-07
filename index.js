import * as core from '/script.js';

const ROOT_ID = 'tt-refresh';
const LABEL = '刷新酒馆';

function assertCanRefresh() {
    if (typeof core.isGenerating !== 'function') {
        throw new Error('当前版本缺少生成状态接口，请使用 TauriTavern 2.4.0。');
    }
    if (core.isGenerating()) throw new Error('请先停止生成，再刷新酒馆。');
    if (core.isChatSaving) throw new Error('聊天正在保存，请稍后再刷新。');
    if (document.querySelector('#chat .edit_textarea')) {
        throw new Error('请先完成或取消消息编辑，再刷新酒馆。');
    }
    if (document.querySelector('#send_textarea')?.value.trim()) {
        throw new Error('输入框还有未发送的内容，请先发送或清空，再刷新酒馆。');
    }
}

function mount() {
    if (document.getElementById(ROOT_ID)) return;
    const toolbar = document.getElementById('top-settings-holder');
    if (!toolbar) {
        toastr.error('没有找到顶端栏，无法添加刷新按钮。', '一键刷新');
        return;
    }

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'drawer';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'drawer-icon closedIcon';
    button.title = LABEL;
    button.setAttribute('aria-label', LABEL);
    const icon = document.createElement('span');
    icon.className = 'fa-solid fa-rotate-right fa-fw';
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);
    root.append(button);
    toolbar.append(root);

    button.addEventListener('click', async () => {
        if (button.disabled) return;
        try {
            assertCanRefresh();
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            button.setAttribute('aria-label', '正在保存并刷新');
            button.title = '正在保存并刷新…';

            // Use the same save queue as the host's graceful exit, and await failures.
            const { flushLifecycleState } = await import('/tauri/main/services/lifecycle/lifecycle-flush-service.js');
            if (typeof flushLifecycleState !== 'function') {
                throw new Error('当前版本缺少保存接口，请使用 TauriTavern 2.4.0。');
            }
            await flushLifecycleState('extension:refresh');
            // The user can start generating or editing while a save is in flight.
            assertCanRefresh();
            window.location.reload();
        } catch (error) {
            console.error('[一键刷新] 已取消刷新：', error);
            toastr.error(error instanceof Error ? error.message : '保存未完成，请稍后重试。', '未刷新');
        } finally {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.setAttribute('aria-label', LABEL);
            button.title = LABEL;
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
    mount();
}
