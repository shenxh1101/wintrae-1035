const LogisticsExtractor = {
  patterns: {
    waybillNumber: [
      /[a-zA-Z]{2,4}\d{10,15}/g,
      /\d{12,18}/g,
      /[a-zA-Z0-9]{10,20}/g
    ],
    phone: /1[3-9]\d{9}/g,
    weight: /(\d+(?:\.\d+)?)\s*(?:kg|千克|公斤|KG|Kg)/gi,
    address: [
      /(?:收货地址|收件地址|地址|送达地址)[:：]\s*([^\n\r]{5,200})/gi,
      /([\u4e00-\u9fa5]{2,}(?:省|市|自治区)[^\n\r，。；]{5,200})/g
    ],
    timeRequirement: [
      /(?:时效|要求|时间|送达|配送)[:：]?\s*([^\n\r，。；]{2,50}(?:当日|次日|次日达|当日达|急|尽快|上午|下午|晚上|早上|中午))/gi,
      /(当日达|次日达|三日达|普通|标准|特快|加急|急件)/g
    ],
    carrier: [
      /(?:承运商|快递公司|物流公司)[:：]?\s*(顺丰|京东|中通|圆通|申通|韵达|极兔|德邦|邮政)/g,
      /(顺丰速运|京东物流|中通快递|圆通速递|申通快递|韵达快递|极兔速递|德邦快递|EMS|中国邮政)/g
    ]
  },

  extractFromPage() {
    const text = this.getPageText();
    const selectedText = window.getSelection()?.toString() || '';
    const sourceText = selectedText || text;

    return this.extractFromText(sourceText);
  },

  getPageText() {
    let text = '';
    const tagsToIgnore = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'];

    function traverse(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const nodeText = node.textContent.trim();
        if (nodeText) {
          text += nodeText + '\n';
        }
      } else if (node.nodeType === Node.ELEMENT_NODE && !tagsToIgnore.includes(node.tagName)) {
        for (const child of node.childNodes) {
          traverse(child);
        }
      }
    }

    traverse(document.body);
    return text;
  },

  extractFromText(text) {
    const waybills = [];
    const lines = text.split('\n').filter(line => line.trim());

    let currentWaybill = null;

    for (const line of lines) {
      const waybillMatch = this.matchWaybillNumber(line);
      if (waybillMatch) {
        if (currentWaybill) {
          waybills.push(currentWaybill);
        }
        currentWaybill = {
          waybillNumber: waybillMatch,
          address: '',
          weight: null,
          timeRequirement: '',
          carrier: '',
          raw: line
        };
      }

      if (currentWaybill) {
        if (!currentWaybill.address) {
          const addressMatch = this.matchAddress(line);
          if (addressMatch) {
            currentWaybill.address = addressMatch;
          }
        }

        if (currentWaybill.weight === null) {
          const weightMatch = this.matchWeight(line);
          if (weightMatch !== null) {
            currentWaybill.weight = weightMatch;
          }
        }

        if (!currentWaybill.timeRequirement) {
          const timeMatch = this.matchTimeRequirement(line);
          if (timeMatch) {
            currentWaybill.timeRequirement = timeMatch;
          }
        }

        if (!currentWaybill.carrier) {
          const carrierMatch = this.matchCarrier(line);
          if (carrierMatch) {
            currentWaybill.carrier = carrierMatch;
          }
        }

        currentWaybill.raw += '\n' + line;
      }
    }

    if (currentWaybill) {
      waybills.push(currentWaybill);
    }

    if (waybills.length === 0) {
      const waybillNums = this.matchAllWaybillNumbers(text);
      if (waybillNums.length > 0) {
        for (const num of waybillNums) {
          waybills.push({
            waybillNumber: num,
            address: this.matchAddress(text),
            weight: this.matchWeight(text),
            timeRequirement: this.matchTimeRequirement(text),
            carrier: this.matchCarrier(text),
            raw: text
          });
        }
      }
    }

    return waybills.map(w => ({
      ...w,
      carrier: this.mapCarrierToId(w.carrier),
      extractedAt: new Date().toISOString()
    }));
  },

  matchWaybillNumber(text) {
    for (const pattern of this.patterns.waybillNumber) {
      const match = text.match(pattern);
      if (match && match[0]) {
        const candidate = match[0];
        if (this.isValidWaybill(candidate)) {
          return candidate.toUpperCase();
        }
      }
    }
    return null;
  },

  matchAllWaybillNumbers(text) {
    const numbers = new Set();
    for (const pattern of this.patterns.waybillNumber) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(m => {
          if (this.isValidWaybill(m)) {
            numbers.add(m.toUpperCase());
          }
        });
      }
    }
    return Array.from(numbers);
  },

  isValidWaybill(num) {
    if (num.length < 10 || num.length > 20) return false;
    const digitCount = (num.match(/\d/g) || []).length;
    return digitCount >= 6;
  },

  matchAddress(text) {
    for (const pattern of this.patterns.address) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
      if (match && match[0]) {
        return match[0].trim();
      }
    }
    return '';
  },

  matchWeight(text) {
    const match = text.match(this.patterns.weight);
    if (match) {
      const numMatch = match[0].match(/\d+(?:\.\d+)?/);
      if (numMatch) {
        return parseFloat(numMatch[0]);
      }
    }
    return null;
  },

  matchTimeRequirement(text) {
    for (const pattern of this.patterns.timeRequirement) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
      if (match && match[0]) {
        return match[0].trim();
      }
    }
    return '';
  },

  matchCarrier(text) {
    for (const pattern of this.patterns.carrier) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
      if (match && match[0]) {
        return match[0].trim();
      }
    }
    return '';
  },

  mapCarrierToId(carrierName) {
    if (!carrierName) return '';
    const carrierMap = {
      '顺丰': 'sf',
      '顺丰速运': 'sf',
      '京东': 'jd',
      '京东物流': 'jd',
      '中通': 'zt',
      '中通快递': 'zt',
      '圆通': 'yt',
      '圆通速递': 'yt'
    };
    return carrierMap[carrierName] || '';
  },

  deduplicateWaybills(waybills) {
    const seen = new Map();
    waybills.forEach(w => {
      const existing = seen.get(w.waybillNumber);
      if (!existing) {
        seen.set(w.waybillNumber, w);
      } else {
        if (!existing.address && w.address) existing.address = w.address;
        if (existing.weight === null && w.weight !== null) existing.weight = w.weight;
        if (!existing.timeRequirement && w.timeRequirement) existing.timeRequirement = w.timeRequirement;
        if (!existing.carrier && w.carrier) existing.carrier = w.carrier;
      }
    });
    return Array.from(seen.values());
  },

  highlightExceptions(exceptions) {
    this.clearHighlights();

    const seenText = new Map();
    exceptions.forEach(exception => {
      const waybillNum = exception.waybillNumber;
      if (!seenText.has(waybillNum)) {
        seenText.set(waybillNum, exception);
      }
    });

    seenText.forEach((exception, text) => {
      this.highlightText(text, exception);
    });
  },

  getExceptionIcon(type) {
    const icons = {
      address_incomplete: '📍',
      address_too_long: '📍',
      out_of_area: '🚫',
      overweight: '⚖️',
      weight_warning: '⚖️',
      duplicate: '🔁',
      time_critical: '⏰'
    };
    return icons[type] || '⚠️';
  },

  getSeverityLabel(severity) {
    const labels = {
      high: '高风险',
      medium: '中风险',
      low: '低风险'
    };
    return labels[severity] || '异常';
  },

  getTypeLabel(type) {
    const labels = {
      address_incomplete: '地址不完整',
      address_too_long: '地址过长',
      out_of_area: '超区件',
      overweight: '超重',
      weight_warning: '重量警告',
      duplicate: '重复运单',
      time_critical: '时效紧急'
    };
    return labels[type] || type;
  },

  highlightText(text, exception) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          if (node.parentElement.closest('.logistics-highlight')) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.nodeValue.includes(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    const severity = exception.severity || 'medium';
    const severityLabel = this.getSeverityLabel(severity);
    const exceptionDetails = exception.exceptions.map(e => {
      return `${this.getExceptionIcon(e.type)} ${this.getTypeLabel(e.type)}: ${e.message}`;
    }).join('\n');
    const suggestions = exception.exceptions.map(e => {
      return `💡 ${e.suggestion}`;
    }).join('\n');

    const tooltipText = `【${severityLabel}】运单号: ${text}\n───────────────\n${exceptionDetails}\n───────────────\n处理建议:\n${suggestions}`;

    const uniqueClass = 'hl-' + Math.random().toString(36).substr(2, 9);

    nodes.forEach(node => {
      let searchFrom = 0;
      while (searchFrom < node.nodeValue.length) {
        const index = node.nodeValue.indexOf(text, searchFrom);
        if (index < 0) break;

        const before = node.nodeValue.substring(0, index);
        const matched = node.nodeValue.substring(index, index + text.length);
        const after = node.nodeValue.substring(index + text.length);

        const parent = node.parentNode;

        if (before) {
          parent.insertBefore(document.createTextNode(before), node);
        }

        const wrapper = document.createElement('span');
        wrapper.className = `logistics-highlight-wrapper ${uniqueClass}`;
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';

        const highlight = document.createElement('span');
        highlight.className = `logistics-highlight logistics-highlight-${severity}`;
        highlight.textContent = matched;
        highlight.title = tooltipText;

        const badge = document.createElement('span');
        badge.className = `logistics-badge logistics-badge-${severity}`;
        const icons = exception.exceptions.slice(0, 2).map(e => this.getExceptionIcon(e.type));
        badge.textContent = icons.join('');
        badge.title = tooltipText;

        wrapper.appendChild(highlight);
        wrapper.appendChild(badge);

        const tooltip = document.createElement('div');
        tooltip.className = 'logistics-tooltip logistics-tooltip-' + severity;
        tooltip.innerHTML = `
          <div class="tooltip-title">
            <span class="tooltip-severity tooltip-severity-${severity}">${severityLabel}</span>
            <span class="tooltip-waybill">运单: ${text}</span>
          </div>
          <div class="tooltip-body">
            ${exception.exceptions.map(e => `
              <div class="tooltip-exception">
                <div class="tooltip-exception-title">
                  <span class="tooltip-icon">${this.getExceptionIcon(e.type)}</span>
                  <span>${this.getTypeLabel(e.type)}</span>
                </div>
                <div class="tooltip-exception-message">${e.message}</div>
                <div class="tooltip-exception-suggestion">💡 ${e.suggestion}</div>
              </div>
            `).join('')}
          </div>
        `;

        wrapper.appendChild(tooltip);
        wrapper.addEventListener('mouseenter', () => {
          tooltip.style.display = 'block';
          const rect = wrapper.getBoundingClientRect();
          const tooltipWidth = tooltip.offsetWidth || 320;
          let left = 0;
          if (rect.left + tooltipWidth > window.innerWidth) {
            left = -(tooltipWidth - rect.width);
          }
          tooltip.style.left = left + 'px';
          tooltip.style.top = (rect.height + 6) + 'px';
        });
        wrapper.addEventListener('mouseleave', () => {
          tooltip.style.display = 'none';
        });

        parent.insertBefore(wrapper, node);

        if (after) {
          parent.insertBefore(document.createTextNode(after), node);
        }

        parent.removeChild(node);

        searchFrom = 0;
        break;
      }
    });
  },

  clearHighlights() {
    document.querySelectorAll('.logistics-highlight-wrapper').forEach(wrapper => {
      const parent = wrapper.parentNode;
      const highlight = wrapper.querySelector('.logistics-highlight');
      if (highlight) {
        const text = document.createTextNode(highlight.textContent);
        parent.replaceChild(text, wrapper);
      }
    });
    document.querySelectorAll('.logistics-highlight').forEach(el => {
      const parent = el.parentNode;
      const text = document.createTextNode(el.textContent);
      parent.replaceChild(text, el);
    });
    if (document.body) {
      document.body.normalize();
    }
  },

  createFloatButton() {
    if (document.getElementById('logistics-float-btn')) return;

    const btn = document.createElement('div');
    btn.id = 'logistics-float-btn';
    btn.className = 'logistics-float-btn';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
        <line x1="12" y1="22.08" x2="12" y2="12"></line>
      </svg>
    `;
    btn.title = '智慧物流助手 - 点击提取运单信息';

    btn.addEventListener('click', async () => {
      const waybills = this.extractFromPage();
      if (waybills.length > 0) {
        await chrome.runtime.sendMessage({
          action: 'saveWaybillData',
          data: waybills
        });
        chrome.runtime.sendMessage({
          action: 'showNotification',
          data: {
            title: '提取成功',
            message: `成功提取 ${waybills.length} 条运单信息`
          }
        });
      } else {
        chrome.runtime.sendMessage({
          action: 'showNotification',
          data: {
            title: '提取失败',
            message: '未在页面中找到运单信息，请选中包含运单的文本后重试'
          }
        });
      }
    });

    document.body.appendChild(btn);
  }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'extractWaybill':
      const waybills = LogisticsExtractor.extractFromPage();
      sendResponse({ success: true, data: waybills });
      if (waybills.length > 0) {
        chrome.runtime.sendMessage({
          action: 'saveWaybillData',
          data: waybills
        });
        chrome.runtime.sendMessage({
          action: 'showNotification',
          data: {
            title: '提取成功',
            message: `成功提取 ${waybills.length} 条运单信息`
          }
        });
      }
      break;
    case 'checkExceptions':
      const extracted = LogisticsExtractor.extractFromPage();
      sendResponse({ success: true, data: extracted });
      if (extracted.length > 0) {
        chrome.runtime.sendMessage({ action: 'getSettings' }, (settingsRes) => {
          if (settingsRes.success) {
            chrome.runtime.sendMessage({
              action: 'checkExceptions',
              data: { waybills: extracted, settings: settingsRes.data }
            }, (exceptionsRes) => {
              if (exceptionsRes.success) {
                LogisticsExtractor.highlightExceptions(exceptionsRes.data);
                chrome.runtime.sendMessage({
                  action: 'showNotification',
                  data: {
                    title: '异常检测完成',
                    message: `检测到 ${exceptionsRes.data.length} 个异常运单`
                  }
                });
              }
            });
          }
        });
      }
      break;
    case 'highlightExceptions':
      LogisticsExtractor.highlightExceptions(request.data);
      break;
    case 'clearHighlights':
      LogisticsExtractor.clearHighlights();
      break;
  }
  return true;
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    LogisticsExtractor.createFloatButton();
  });
} else {
  LogisticsExtractor.createFloatButton();
}
