(function () {
  'use strict';

  const SECURE_PATH = window.settings.secure_path;
  const API_FETCH = '/api/v1/' + SECURE_PATH + '/config/fetchDomainRewriteRules';
  const API_SAVE = '/api/v1/' + SECURE_PATH + '/config/saveDomainRewriteRules';

  let rules = [];
  let injected = false;
  let saving = false;

  // ========== API ==========
  function getAuthHeader() {
    return { authorization: localStorage.getItem('authorization') || '' };
  }

  function fetchRules() {
    return fetch(API_FETCH, { headers: getAuthHeader() })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        rules = res.data || [];
        return rules;
      });
  }

  function saveRules() {
    if (saving) return Promise.resolve();
    saving = true;
    updateSaveBtn();
    return fetch(API_SAVE, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeader()),
      body: JSON.stringify({ rules: rules })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        saving = false;
        updateSaveBtn();
        if (res.data === true) {
          showToast('success');
        } else {
          showToast('error', res.message || '保存失败');
        }
      })
      .catch(function (err) {
        saving = false;
        updateSaveBtn();
        showToast('error', err.message || '请求失败');
      });
  }

  // ========== Toast ==========
  function showToast(type, msg) {
    var toast = document.createElement('div');
    toast.textContent = type === 'success' ? '保存成功' : (msg || '操作失败');
    toast.style.cssText = 'position:fixed;top:24px;right:24px;z-index:99999;padding:10px 24px;border-radius:4px;color:#fff;font-size:14px;' +
      (type === 'success' ? 'background:#52c41a;' : 'background:#ff4d4f;');
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 2500);
  }

  // ========== Render ==========
  function updateSaveBtn() {
    var btn = document.getElementById('drr-save-btn');
    if (btn) {
      btn.disabled = saving;
      btn.textContent = saving ? '保存中...' : '保存';
    }
  }

  function renderPanel() {
    var container = document.getElementById('drr-container');
    if (!container) return;

    var html = '<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">' +
      '<thead><tr style="background:#fafafa;text-align:left;">' +
      '<th style="padding:8px 12px;border-bottom:1px solid #e8e8e8;width:22%;">UA 关键词</th>' +
      '<th style="padding:8px 12px;border-bottom:1px solid #e8e8e8;width:22%;">匹配域名</th>' +
      '<th style="padding:8px 12px;border-bottom:1px solid #e8e8e8;width:22%;">替换 IP</th>' +
      '<th style="padding:8px 12px;border-bottom:1px solid #e8e8e8;width:22%;">备注</th>' +
      '<th style="padding:8px 12px;border-bottom:1px solid #e8e8e8;width:12%;text-align:center;">操作</th>' +
      '</tr></thead><tbody>';

    if (rules.length === 0) {
      html += '<tr><td colspan="5" style="padding:16px;text-align:center;color:#999;border-bottom:1px solid #e8e8e8;">暂无规则，点击下方按钮添加</td></tr>';
    } else {
      rules.forEach(function (rule, i) {
        html += '<tr data-index="' + i + '">' +
          '<td style="padding:6px 12px;border-bottom:1px solid #e8e8e8;"><input type="text" class="drr-input" data-field="ua" data-index="' + i + '" value="' + escapeAttr(rule.ua) + '" placeholder="如 Atlas/1.0" /></td>' +
          '<td style="padding:6px 12px;border-bottom:1px solid #e8e8e8;"><input type="text" class="drr-input" data-field="domain" data-index="' + i + '" value="' + escapeAttr(rule.domain) + '" placeholder="如 example.com" /></td>' +
          '<td style="padding:6px 12px;border-bottom:1px solid #e8e8e8;"><input type="text" class="drr-input" data-field="ip" data-index="' + i + '" value="' + escapeAttr(rule.ip) + '" placeholder="如 1.2.3.4" /></td>' +
          '<td style="padding:6px 12px;border-bottom:1px solid #e8e8e8;"><input type="text" class="drr-input" data-field="remark" data-index="' + i + '" value="' + escapeAttr(rule.remark || '') + '" placeholder="可选" /></td>' +
          '<td style="padding:6px 12px;border-bottom:1px solid #e8e8e8;text-align:center;"><button class="drr-del-btn" data-index="' + i + '" style="color:#ff4d4f;background:none;border:1px solid #ff4d4f;border-radius:4px;padding:2px 12px;cursor:pointer;font-size:13px;">删除</button></td>' +
          '</tr>';
      });
    }

    html += '</tbody></table>';
    html += '<div style="display:flex;gap:8px;">' +
      '<button id="drr-add-btn" style="background:#1890ff;color:#fff;border:none;border-radius:4px;padding:6px 20px;cursor:pointer;font-size:14px;">+ 添加规则</button>' +
      '<button id="drr-save-btn" style="background:#52c41a;color:#fff;border:none;border-radius:4px;padding:6px 20px;cursor:pointer;font-size:14px;">' + (saving ? '保存中...' : '保存') + '</button>' +
      '</div>';

    container.innerHTML = html;
    bindEvents();
  }

  function escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function bindEvents() {
    // input change - use both input and change to ensure values sync before save
    var inputs = document.querySelectorAll('.drr-input');
    inputs.forEach(function (input) {
      input.addEventListener('input', function () {
        var idx = parseInt(this.getAttribute('data-index'));
        var field = this.getAttribute('data-field');
        rules[idx][field] = this.value;
      });
    });

    // delete
    var delBtns = document.querySelectorAll('.drr-del-btn');
    delBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(this.getAttribute('data-index'));
        rules.splice(idx, 1);
        renderPanel();
      });
    });

    // add
    var addBtn = document.getElementById('drr-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        rules.push({ ua: '', domain: '', ip: '', remark: '' });
        renderPanel();
        // focus the new row's first input
        var newInputs = document.querySelectorAll('.drr-input[data-index="' + (rules.length - 1) + '"]');
        if (newInputs.length) newInputs[0].focus();
      });
    }

    // save
    var saveBtn = document.getElementById('drr-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        // validate
        for (var i = 0; i < rules.length; i++) {
          if (!rules[i].ua || !rules[i].domain || !rules[i].ip) {
            showToast('error', '第 ' + (i + 1) + ' 条规则的 UA、域名、IP 为必填项');
            return;
          }
        }
        saveRules();
      });
    }
  }

  // ========== Inject ==========
  function injectPanel() {
    if (injected) return;
    // Find subscribe tab content - look for the active tab panel in settings page
    var tabPanels = document.querySelectorAll('.ant-tabs-tabpane-active, .ant-tabs-tabpane.ant-tabs-tabpane-active');
    if (!tabPanels.length) return;

    var panel = tabPanels[tabPanels.length - 1];
    // Check if we're on the subscribe tab by searching for known text rendered by React components
    var panelText = panel.textContent || '';
    var isSubscribeTab = panelText.indexOf('允许用户更改订阅') !== -1 ||
      panelText.indexOf('月流量重置方式') !== -1 ||
      panelText.indexOf('开启折抵方案') !== -1;

    if (!isSubscribeTab) return;
    if (document.getElementById('drr-section')) return;

    injected = true;

    var section = document.createElement('div');
    section.id = 'drr-section';
    section.style.cssText = 'margin-top:24px;padding:20px;background:#fff;border:1px solid #e8e8e8;border-radius:4px;';
    section.innerHTML = '<h3 style="margin:0 0 4px 0;font-size:16px;font-weight:600;">订阅域名重写规则</h3>' +
      '<p style="margin:0 0 16px 0;color:#999;font-size:13px;">当客户端 UA 包含指定关键词时，将节点列表中匹配的域名替换为指定 IP 下发</p>' +
      '<div id="drr-container"><div style="text-align:center;padding:20px;color:#999;">加载中...</div></div>';

    panel.appendChild(section);

    fetchRules().then(function () {
      renderPanel();
    }).catch(function () {
      var c = document.getElementById('drr-container');
      if (c) c.innerHTML = '<div style="color:#ff4d4f;padding:12px;">加载规则失败，请刷新页面重试</div>';
    });
  }

  // ========== Style ==========
  function injectStyle() {
    var style = document.createElement('style');
    style.textContent = '.drr-input{width:100%;padding:4px 8px;border:1px solid #d9d9d9;border-radius:4px;font-size:13px;box-sizing:border-box;outline:none;transition:border-color .2s;}' +
      '.drr-input:focus{border-color:#1890ff;box-shadow:0 0 0 2px rgba(24,144,255,.2);}' +
      '.drr-del-btn:hover{background:#fff1f0!important;color:#ff4d4f!important;}' +
      '#drr-add-btn:hover{opacity:.85;}#drr-save-btn:hover{opacity:.85;}' +
      '#drr-save-btn:disabled{opacity:.5;cursor:not-allowed;}';
    document.head.appendChild(style);
  }

  // ========== Observer ==========
  function startObserver() {
    injectStyle();
    // Check periodically for tab changes since the SPA re-renders content
    setInterval(function () {
      var section = document.getElementById('drr-section');
      if (!section) {
        injected = false;
      }
      if (!injected) {
        injectPanel();
      }
    }, 800);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }
})();
