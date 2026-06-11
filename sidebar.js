const SidebarApp = {
  state: {
    waybills: [],
    exceptions: [],
    costEstimates: [],
    routeAnalysis: [],
    templates: [],
    settings: null,
    workOrders: [],
    currentTab: 'batch',
    selectedWaybill: null,
    searchQuery: '',
    exceptionFilter: 'all'
  },

  init() {
    this.bindEvents();
    this.loadInitialData();
    this.setupTabs();
  },

  async loadInitialData() {
    try {
      const [settingsRes, templatesRes, waybillsRes] = await Promise.all([
        this.sendMessage({ action: 'getSettings' }),
        this.sendMessage({ action: 'getTemplates' }),
        this.sendMessage({ action: 'getWaybillData' })
      ]);

      if (settingsRes.success) {
        this.state.settings = settingsRes.data;
        this.populateCarrierSelect();
        this.populateCarrierConfig();
      }

      if (templatesRes.success) {
        this.state.templates = templatesRes.data;
        this.renderTemplates();
      }

      if (waybillsRes.success) {
        this.state.waybills = waybillsRes.data;
        this.renderWaybillList();
        this.updateStats();
      }
    } catch (error) {
      console.error('加载初始数据失败:', error);
    }
  },

  bindEvents() {
    document.getElementById('extractBtn').addEventListener('click', () => this.extractWaybills());
    document.getElementById('clearBtn').addEventListener('click', () => this.clearWaybills());
    document.getElementById('checkBtn').addEventListener('click', () => this.checkExceptions());
    document.getElementById('refreshBtn').addEventListener('click', () => this.refreshData());
    document.getElementById('settingsBtn').addEventListener('click', () => this.openModal('settingsModal'));
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.state.searchQuery = e.target.value;
      this.renderWaybillList();
    });
    document.getElementById('analyzeRouteBtn').addEventListener('click', () => this.analyzeRoute());
    document.getElementById('showMapBtn').addEventListener('click', () => this.showMap());
    document.getElementById('estimateCostBtn').addEventListener('click', () => this.estimateCost());
    document.getElementById('carrierSelect').addEventListener('change', () => {
      if (this.state.costEstimates.length > 0) {
        this.estimateCost();
      }
    });
    document.getElementById('generateReportBtn').addEventListener('click', () => this.generateReport());
    document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
    document.getElementById('addTemplateBtn').addEventListener('click', () => this.openModal('templateModal'));
    document.getElementById('exceptionFilter').addEventListener('change', (e) => {
      this.state.exceptionFilter = e.target.value;
      this.renderWorkOrders();
    });
    document.getElementById('closeModal').addEventListener('click', () => this.closeModal('detailModal'));
    document.getElementById('closeTemplateModal').addEventListener('click', () => this.closeModal('templateModal'));
    document.getElementById('closeSettingsModal').addEventListener('click', () => this.closeModal('settingsModal'));
    document.getElementById('cancelTemplateBtn').addEventListener('click', () => this.closeModal('templateModal'));
    document.getElementById('cancelSettingsBtn').addEventListener('click', () => this.closeModal('settingsModal'));
    document.getElementById('saveTemplateBtn').addEventListener('click', () => this.saveTemplate());
    document.getElementById('saveSettingsBtn').addEventListener('click', () => this.saveSettings());
    document.getElementById('copyWaybillBtn').addEventListener('click', () => this.copyWaybillNumber());
    document.getElementById('applyTemplateBtn').addEventListener('click', () => this.applyTemplate());
    document.getElementById('saveRemarkBtn').addEventListener('click', () => this.saveRemark());
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'modalOverlay') {
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        document.getElementById('modalOverlay').classList.remove('active');
      }
    });
  },

  setupTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        this.switchTab(tabName);
      });
    });
  },

  switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');

    this.state.currentTab = tabName;
  },

  async extractWaybills() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractWaybill' });

      if (response && response.success && response.data.length > 0) {
        const saveRes = await this.sendMessage({
          action: 'saveWaybillData',
          data: response.data
        });

        if (saveRes.success) {
          this.state.waybills = saveRes.data;
          this.renderWaybillList();
          this.updateStats();
          this.showToast(`成功提取 ${response.data.length} 条运单信息`, 'success');
        }
      } else {
        this.showToast('未提取到运单信息，请确保页面包含运单数据', 'warning');
      }
    } catch (error) {
      console.error('提取运单失败:', error);
      this.showToast('提取失败，请刷新页面后重试', 'error');
    }
  },

  async clearWaybills() {
    if (!confirm('确定要清空所有运单数据吗？')) return;

    try {
      await this.sendMessage({ action: 'clearWaybillData' });
      this.state.waybills = [];
      this.state.exceptions = [];
      this.state.costEstimates = [];
      this.state.routeAnalysis = [];
      this.state.workOrders = [];
      this.renderWaybillList();
      this.updateStats();
      this.renderWorkOrders();
      this.showToast('数据已清空', 'success');
    } catch (error) {
      this.showToast('清空失败', 'error');
    }
  },

  async checkExceptions() {
    if (this.state.waybills.length === 0) {
      this.showToast('请先提取运单数据', 'warning');
      return;
    }

    try {
      const response = await this.sendMessage({
        action: 'checkExceptions',
        data: {
          waybills: this.state.waybills,
          settings: this.state.settings
        }
      });

      if (response.success) {
        this.state.exceptions = response.data;
        this.generateWorkOrders();
        this.renderWaybillList();
        this.updateStats();
        this.switchTab('exception');

        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          await chrome.tabs.sendMessage(tab.id, {
            action: 'highlightExceptions',
            data: this.state.exceptions
          });
        } catch (e) {
          console.warn('页面高亮失败:', e);
        }

        this.showToast(`检测到 ${response.data.length} 个异常运单`, 'warning');
      }
    } catch (error) {
      console.error('检查异常失败:', error);
      this.showToast('检查异常失败', 'error');
    }
  },

  generateWorkOrders() {
    this.state.workOrders = this.state.exceptions.map(exception => {
      const existing = this.state.workOrders.find(w => w.waybillNumber === exception.waybillNumber);
      return {
        id: 'wo-' + exception.waybillNumber,
        waybillNumber: exception.waybillNumber,
        address: exception.address,
        weight: exception.weight,
        carrier: exception.carrier,
        exceptions: exception.exceptions,
        status: existing?.status || 'pending',
        remark: existing?.remark || '',
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });
    this.renderWorkOrders();
  },

  async analyzeRoute() {
    if (this.state.waybills.length === 0) {
      this.showToast('请先提取运单数据', 'warning');
      return;
    }

    try {
      const response = await this.sendMessage({
        action: 'checkRoute',
        data: { waybills: this.state.waybills }
      });

      if (response.success) {
        this.state.routeAnalysis = response.data;
        this.renderRouteAnalysis();
        this.showToast(`发现 ${response.data.length} 条路线优化建议`, 'success');
        if (response.data.length > 0) {
          this.showMap();
        }
      }
    } catch (error) {
      console.error('路线分析失败:', error);
      this.showToast('路线分析失败', 'error');
    }
  },

  showMap() {
    const container = document.getElementById('mapContainer');
    const waybills = this.state.waybills;

    if (waybills.length === 0) {
      this.showToast('没有可显示的运单数据', 'warning');
      return;
    }

    const cities = {};
    waybills.forEach(w => {
      const city = this.extractCity(w.address) || '未知';
      if (!cities[city]) {
        cities[city] = [];
      }
      cities[city].push(w);
    });

    const cityList = Object.entries(cities);
    const positions = this.generateCityPositions(cityList.length);

    let mapHTML = '<div class="map-content">';
    cityList.forEach(([city, cityWaybills], index) => {
      const pos = positions[index];
      const count = cityWaybills.length;
      mapHTML += `
        <div class="map-marker ${count >= 3 ? 'cluster' : ''}"
             style="left: ${pos.x}%; top: ${pos.y}%;"
             title="${city}: ${count}个订单">
          ${count}
        </div>
      `;
    });
    mapHTML += '</div>';

    mapHTML += `
      <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #f3f4f6;">
        <h4 style="font-size: 13px; margin-bottom: 8px; color: #374151;">配送区域分布</h4>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${cityList.map(([city, cityWaybills]) => `
            <span style="padding: 4px 10px; background: #eff6ff; color: #2563eb; border-radius: 20px; font-size: 11px;">
              ${city} (${cityWaybills.length})
            </span>
          `).join('')}
        </div>
      </div>
    `;

    container.innerHTML = mapHTML;
  },

  generateCityPositions(count) {
    const positions = [];
    const margin = 15;
    const usableSize = 100 - 2 * margin;

    if (count <= 4) {
      const angleStep = (2 * Math.PI) / count;
      const radius = usableSize / 3;
      for (let i = 0; i < count; i++) {
        const angle = angleStep * i - Math.PI / 2;
        positions.push({
          x: 50 + radius * Math.cos(angle),
          y: 50 + radius * Math.sin(angle)
        });
      }
    } else {
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      const stepX = usableSize / (cols - 1 || 1);
      const stepY = usableSize / (rows - 1 || 1);

      for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        positions.push({
          x: margin + col * stepX,
          y: margin + row * stepY
        });
      }
    }

    return positions;
  },

  extractCity(address) {
    if (!address) return '';
    const match = address.match(/([\u4e00-\u9fa5]{2,10}?)市/);
    if (match) return match[1] + '市';
    const directMatch = address.match(/^(北京|上海|天津|重庆)/);
    if (directMatch) return directMatch[1] + '市';
    return '';
  },

  async estimateCost() {
    if (this.state.waybills.length === 0) {
      this.showToast('请先提取运单数据', 'warning');
      return;
    }

    try {
      const selectedCarrier = document.getElementById('carrierSelect').value;
      const waybillsWithCarrier = this.state.waybills.map(w => ({
        ...w,
        carrier: selectedCarrier || w.carrier || this.state.settings.carriers[0].id
      }));

      const response = await this.sendMessage({
        action: 'estimateCost',
        data: {
          waybills: waybillsWithCarrier,
          settings: this.state.settings
        }
      });

      if (response.success) {
        this.state.costEstimates = response.data;
        this.renderCostList();
        this.updateCostSummary();
        this.showToast(`已估算 ${response.data.length} 条运单费用`, 'success');
      }
    } catch (error) {
      console.error('费用估算失败:', error);
      this.showToast('费用估算失败', 'error');
    }
  },

  generateReport() {
    if (this.state.workOrders.length === 0) {
      this.showToast('没有异常工单可生成报告', 'warning');
      return;
    }

    const totalExceptions = this.state.workOrders.length;
    const highCount = this.state.workOrders.filter(w =>
      w.exceptions.some(e => e.severity === 'high')
    ).length;
    const mediumCount = this.state.workOrders.filter(w =>
      w.exceptions.some(e => e.severity === 'medium')
    ).length;

    const report = {
      generatedAt: new Date().toLocaleString('zh-CN'),
      totalWaybills: this.state.waybills.length,
      totalExceptions,
      severityBreakdown: {
        high: highCount,
        medium: mediumCount,
        low: totalExceptions - highCount - mediumCount
      },
      workOrders: this.state.workOrders.map(wo => ({
        waybillNumber: wo.waybillNumber,
        address: wo.address,
        exceptions: wo.exceptions.map(e => ({
          type: e.type,
          message: e.message,
          suggestion: e.suggestion
        })),
        status: wo.status,
        remark: wo.remark
      }))
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `异常报告_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    this.showToast('异常报告已生成并下载', 'success');
  },

  async exportData() {
    if (this.state.workOrders.length === 0 && this.state.waybills.length === 0) {
      this.showToast('没有数据可导出', 'warning');
      return;
    }

    const exceptionMap = new Map(
      this.state.workOrders.map(w => [w.waybillNumber, w])
    );

    const records = this.state.waybills.map(w => {
      const workOrder = exceptionMap.get(w.waybillNumber);
      const carrier = this.state.settings.carriers.find(c => c.id === w.carrier);

      return {
        waybillNumber: w.waybillNumber,
        address: w.address,
        weight: w.weight,
        carrierName: carrier?.name || w.carrier,
        timeRequirement: w.timeRequirement,
        exceptionTypes: workOrder?.exceptions.map(e => e.type) || [],
        messages: workOrder?.exceptions.map(e => e.message) || [],
        suggestions: workOrder?.exceptions.map(e => e.suggestion) || [],
        remark: workOrder?.remark || ''
      };
    }).filter(r => r.exceptionTypes.length > 0 || this.state.exceptionFilter === 'all');

    const format = confirm('点击"确定"导出CSV格式，点击"取消"导出JSON格式') ? 'csv' : 'json';

    try {
      await this.sendMessage({
        action: 'exportData',
        data: { records, format }
      });
      this.showToast(`数据已导出为 ${format.toUpperCase()} 格式`, 'success');
    } catch (error) {
      console.error('导出失败:', error);
      this.showToast('导出失败', 'error');
    }
  },

  async saveTemplate() {
    const name = document.getElementById('templateName').value.trim();
    const type = document.getElementById('templateType').value;
    const content = document.getElementById('templateContent').value.trim();

    if (!name || !content) {
      this.showToast('请填写完整的模板信息', 'warning');
      return;
    }

    try {
      const response = await this.sendMessage({
        action: 'saveTemplate',
        data: { name, type, content }
      });

      if (response.success) {
        this.state.templates = response.data;
        this.renderTemplates();
        this.closeModal('templateModal');
        document.getElementById('templateName').value = '';
        document.getElementById('templateContent').value = '';
        this.showToast('模板保存成功', 'success');
      }
    } catch (error) {
      this.showToast('保存模板失败', 'error');
    }
  },

  async deleteTemplate(id) {
    if (!confirm('确定要删除这个模板吗？')) return;

    try {
      const response = await this.sendMessage({
        action: 'deleteTemplate',
        id
      });

      if (response.success) {
        this.state.templates = response.data;
        this.renderTemplates();
        this.showToast('模板已删除', 'success');
      }
    } catch (error) {
      this.showToast('删除失败', 'error');
    }
  },

  async saveSettings() {
    try {
      const weightThreshold = parseInt(document.getElementById('weightThreshold').value);
      const minAddressLength = parseInt(document.getElementById('minAddressLength').value);
      const maxAddressLength = parseInt(document.getElementById('maxAddressLength').value);

      const carriers = [];
      document.querySelectorAll('.carrier-config-item').forEach(item => {
        const id = item.dataset.id;
        const name = item.querySelector('.carrier-name').value;
        const basePrice = parseFloat(item.querySelector('.carrier-base-price').value);
        const pricePerKg = parseFloat(item.querySelector('.carrier-price-per-kg').value);
        const weightLimit = parseFloat(item.querySelector('.carrier-weight-limit').value);

        carriers.push({
          id,
          name,
          basePrice,
          pricePerKg,
          weightLimit,
          deliveryAreas: this.state.settings.carriers.find(c => c.id === id)?.deliveryAreas || []
        });
      });

      const newSettings = {
        ...this.state.settings,
        weightThreshold,
        minAddressLength,
        maxAddressLength,
        carriers
      };

      const response = await this.sendMessage({
        action: 'saveSettings',
        data: newSettings
      });

      if (response.success) {
        this.state.settings = newSettings;
        this.populateCarrierSelect();
        this.closeModal('settingsModal');
        this.showToast('设置保存成功', 'success');
      }
    } catch (error) {
      this.showToast('保存设置失败', 'error');
    }
  },

  copyWaybillNumber() {
    if (this.state.selectedWaybill) {
      navigator.clipboard.writeText(this.state.selectedWaybill.waybillNumber);
      this.showToast('运单号已复制到剪贴板', 'success');
    }
  },

  applyTemplate() {
    const templates = this.state.templates;
    if (templates.length === 0) {
      this.showToast('没有可用的模板', 'warning');
      return;
    }

    const templateList = templates.map((t, i) => `${i + 1}. ${t.name}`).join('\n');
    const selection = prompt(`请选择要应用的模板编号：\n${templateList}`);

    if (selection) {
      const index = parseInt(selection) - 1;
      if (index >= 0 && index < templates.length) {
        const template = templates[index];
        const remarkInput = document.querySelector('.remark-input');
        if (remarkInput) {
          remarkInput.value = template.content;
        }
        this.showToast(`已应用模板：${template.name}`, 'success');
      } else {
        this.showToast('无效的模板编号', 'error');
      }
    }
  },

  saveRemark() {
    if (!this.state.selectedWaybill) return;

    const remarkInput = document.querySelector('.remark-input');
    const remark = remarkInput?.value.trim() || '';

    const workOrder = this.state.workOrders.find(
      w => w.waybillNumber === this.state.selectedWaybill.waybillNumber
    );

    if (workOrder) {
      workOrder.remark = remark;
      workOrder.updatedAt = new Date().toISOString();
      this.renderWorkOrders();
    }

    const waybill = this.state.waybills.find(
      w => w.waybillNumber === this.state.selectedWaybill.waybillNumber
    );
    if (waybill) {
      waybill.remark = remark;
      this.sendMessage({
        action: 'saveWaybillData',
        data: this.state.waybills
      });
    }

    this.closeModal('detailModal');
    this.showToast('备注保存成功', 'success');
  },

  updateWorkOrderStatus(waybillNumber, status) {
    const workOrder = this.state.workOrders.find(w => w.waybillNumber === waybillNumber);
    if (workOrder) {
      workOrder.status = status;
      workOrder.updatedAt = new Date().toISOString();
      this.renderWorkOrders();
      this.updateStats();
      this.showToast(`状态已更新为：${this.getStatusLabel(status)}`, 'success');
    }
  },

  getStatusLabel(status) {
    const labels = {
      pending: '待处理',
      processing: '处理中',
      completed: '已完成'
    };
    return labels[status] || status;
  },

  getSeverityLabel(type) {
    const labels = {
      address_incomplete: '地址不完整',
      address_too_long: '地址过长',
      out_of_area: '超区',
      overweight: '超重',
      weight_warning: '重量警告',
      duplicate: '重复运单',
      time_critical: '时效紧急'
    };
    return labels[type] || type;
  },

  refreshData() {
    this.loadInitialData();
    this.showToast('数据已刷新', 'success');
  },

  renderWaybillList() {
    const container = document.getElementById('waybillList');
    let waybills = [...this.state.waybills];

    if (this.state.searchQuery) {
      const query = this.state.searchQuery.toLowerCase();
      waybills = waybills.filter(w =>
        w.waybillNumber.toLowerCase().includes(query) ||
        (w.address && w.address.toLowerCase().includes(query))
      );
    }

    if (waybills.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
          <p>${this.state.searchQuery ? '未找到匹配的运单' : '暂无运单数据'}</p>
          <p class="sub-text">${this.state.searchQuery ? '请尝试其他搜索关键词' : '点击"提取页面运单"按钮开始'}</p>
        </div>
      `;
      return;
    }

    const exceptionMap = new Map(
      this.state.exceptions.map(e => [e.waybillNumber, e])
    );

    container.innerHTML = waybills.map(waybill => {
      const exception = exceptionMap.get(waybill.waybillNumber);
      let severity = 'normal';
      let exceptionTags = '';

      if (exception) {
        const severities = exception.exceptions.map(e => e.severity);
        if (severities.includes('high')) severity = 'high';
        else if (severities.includes('medium')) severity = 'medium';
        else severity = 'low';

        exceptionTags = `
          <div class="exception-tags">
            ${exception.exceptions.map(e => `
              <span class="exception-tag">${this.getSeverityLabel(e.type)}</span>
            `).join('')}
          </div>
        `;
      }

      const carrier = this.state.settings?.carriers.find(c => c.id === waybill.carrier);

      return `
        <div class="waybill-card severity-${severity}" data-waybill="${waybill.waybillNumber}">
          <div class="waybill-header">
            <span class="waybill-number">${waybill.waybillNumber}</span>
            <span class="severity-badge severity-${severity}">
              ${severity === 'normal' ? '正常' : severity === 'high' ? '高风险' : severity === 'medium' ? '中风险' : '低风险'}
            </span>
          </div>
          <div class="waybill-details">
            <div class="waybill-detail-row">
              <span class="waybill-detail-label">地址:</span>
              <span class="waybill-detail-value">${waybill.address || '未识别'}</span>
            </div>
            <div class="waybill-detail-row">
              <span class="waybill-detail-label">重量:</span>
              <span class="waybill-detail-value">${waybill.weight !== null ? waybill.weight + ' kg' : '未识别'}</span>
            </div>
            <div class="waybill-detail-row">
              <span class="waybill-detail-label">承运商:</span>
              <span class="waybill-detail-value">${carrier?.name || waybill.carrier || '未指定'}</span>
            </div>
            ${waybill.timeRequirement ? `
            <div class="waybill-detail-row">
              <span class="waybill-detail-label">时效:</span>
              <span class="waybill-detail-value">${waybill.timeRequirement}</span>
            </div>
            ` : ''}
          </div>
          ${exceptionTags}
        </div>
      `;
    }).join('');

    container.querySelectorAll('.waybill-card').forEach(card => {
      card.addEventListener('click', () => {
        const waybillNumber = card.dataset.waybill;
        this.openWaybillDetail(waybillNumber);
      });
    });
  },

  openWaybillDetail(waybillNumber) {
    const waybill = this.state.waybills.find(w => w.waybillNumber === waybillNumber);
    const exception = this.state.exceptions.find(e => e.waybillNumber === waybillNumber);
    const workOrder = this.state.workOrders.find(w => w.waybillNumber === waybillNumber);
    const costEstimate = this.state.costEstimates.find(c => c.waybillNumber === waybillNumber);

    if (!waybill) return;

    this.state.selectedWaybill = waybill;
    const carrier = this.state.settings?.carriers.find(c => c.id === waybill.carrier);

    let exceptionsHTML = '';
    if (exception) {
      exceptionsHTML = `
        <div class="detail-section">
          <h4>异常信息</h4>
          ${exception.exceptions.map(e => `
            <div class="detail-row">
              <span class="detail-label">${this.getSeverityLabel(e.type)}</span>
              <span class="detail-value" style="color: ${e.severity === 'high' ? '#dc2626' : e.severity === 'medium' ? '#d97706' : '#2563eb'}">
                ${e.message}
              </span>
            </div>
            <div class="detail-row">
              <span class="detail-label">建议:</span>
              <span class="detail-value" style="color: #6b7280;">${e.suggestion}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    let costHTML = '';
    if (costEstimate) {
      costHTML = `
        <div class="detail-section">
          <h4>费用估算</h4>
          <div class="detail-row">
            <span class="detail-label">承运商:</span>
            <span class="detail-value">${costEstimate.carrier}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">基础费用:</span>
            <span class="detail-value">¥${costEstimate.basePrice.toFixed(2)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">续重费用:</span>
            <span class="detail-value">¥${costEstimate.additionalCost.toFixed(2)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">总计:</span>
            <span class="detail-value" style="color: #10b981; font-weight: 600;">¥${costEstimate.totalCost.toFixed(2)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">预计送达:</span>
            <span class="detail-value">
              <span class="delivery-window">${costEstimate.deliveryWindow.label} ${costEstimate.deliveryWindow.start}-${costEstimate.deliveryWindow.end}</span>
            </span>
          </div>
        </div>
      `;
    }

    const remark = workOrder?.remark || waybill.remark || '';

    document.getElementById('modalBody').innerHTML = `
      <div class="detail-section">
        <h4>基本信息</h4>
        <div class="detail-row">
          <span class="detail-label">运单号:</span>
          <span class="detail-value" style="font-family: 'SF Mono', Consolas, monospace;">${waybill.waybillNumber}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">收件地址:</span>
          <span class="detail-value">${waybill.address || '未识别'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">重量:</span>
          <span class="detail-value">${waybill.weight !== null ? waybill.weight + ' kg' : '未识别'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">承运商:</span>
          <span class="detail-value">${carrier?.name || waybill.carrier || '未指定'}</span>
        </div>
        ${waybill.timeRequirement ? `
        <div class="detail-row">
          <span class="detail-label">时效要求:</span>
          <span class="detail-value">${waybill.timeRequirement}</span>
        </div>
        ` : ''}
      </div>
      ${exceptionsHTML}
      ${costHTML}
      <div class="detail-section">
        <h4>处理备注</h4>
        <textarea class="remark-input" id="detailRemark" placeholder="请输入处理备注或异常原因...">${remark}</textarea>
      </div>
    `;

    this.openModal('detailModal');
  },

  renderRouteAnalysis() {
    const container = document.getElementById('routeAnalysis');

    if (this.state.routeAnalysis.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <polygon points="10 8 16 12 10 16 10 8"></polygon>
          </svg>
          <p>暂无路线分析结果</p>
          <p class="sub-text">请点击"分析路线"按钮开始分析</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.state.routeAnalysis.map(analysis => {
      const cardClass = analysis.type === 'merge_opportunity' ? 'merge' :
                        analysis.type === 'multiple_cities' ? 'warning' : '';

      let waybillsHTML = '';
      if (analysis.waybills && analysis.waybills.length > 0) {
        waybillsHTML = `
          <div class="route-waybills">
            ${analysis.waybills.slice(0, 5).map(w => `
              <span class="route-waybill-tag">${w}</span>
            `).join('')}
            ${analysis.waybills.length > 5 ? `<span class="route-waybill-tag">+${analysis.waybills.length - 5}</span>` : ''}
          </div>
        `;
      }

      return `
        <div class="route-card ${cardClass}">
          <div class="route-header">
            <span class="route-title">
              ${analysis.type === 'merge_opportunity' ? '合单机会' :
                analysis.type === 'multiple_cities' ? '多城市分布' : '路线分析'}
              ${analysis.area ? ` - ${analysis.area}` : ''}
            </span>
            <span class="route-count">${analysis.count} 单</span>
          </div>
          <p class="route-message">${analysis.message}</p>
          <p class="route-suggestion">${analysis.suggestion}</p>
          ${waybillsHTML}
        </div>
      `;
    }).join('');

    document.getElementById('routeCount').textContent = this.state.routeAnalysis.length;
  },

  renderCostList() {
    const container = document.getElementById('costList');

    if (this.state.costEstimates.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <line x1="12" y1="1" x2="12" y2="23"></line>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
          <p>暂无费用估算结果</p>
          <p class="sub-text">请点击"估算费用"按钮开始估算</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.state.costEstimates.map(estimate => `
      <div class="cost-card">
        <div class="cost-header">
          <span class="waybill-number">${estimate.waybillNumber}</span>
          <span class="cost-carrier">${estimate.carrier}</span>
        </div>
        <div class="cost-breakdown">
          <div class="cost-breakdown-item">
            <span>重量</span>
            <span class="cost-breakdown-value">${estimate.weight} kg</span>
          </div>
          <div class="cost-breakdown-item">
            <span>基础费用</span>
            <span class="cost-breakdown-value">¥${estimate.basePrice.toFixed(2)}</span>
          </div>
          <div class="cost-breakdown-item">
            <span>续重费用</span>
            <span class="cost-breakdown-value">¥${estimate.additionalCost.toFixed(2)}</span>
          </div>
          <div class="cost-breakdown-item">
            <span>送达时段</span>
            <span class="cost-breakdown-value">
              <span class="delivery-window">${estimate.deliveryWindow.label}</span>
            </span>
          </div>
        </div>
        <div class="cost-total">
          <span class="cost-total-label">预估运费</span>
          <span class="cost-total-value">¥${estimate.totalCost.toFixed(2)}</span>
        </div>
      </div>
    `).join('');

    document.getElementById('costCount').textContent = this.state.costEstimates.length;
  },

  updateCostSummary() {
    const estimates = this.state.costEstimates;
    if (estimates.length === 0) {
      document.getElementById('totalCost').textContent = '¥0.00';
      document.getElementById('avgCost').textContent = '¥0.00';
      document.getElementById('avgTime').textContent = '-';
      return;
    }

    const totalCost = estimates.reduce((sum, e) => sum + e.totalCost, 0);
    const avgCost = totalCost / estimates.length;

    const windowCounts = {};
    estimates.forEach(e => {
      const key = e.deliveryWindow.label;
      windowCounts[key] = (windowCounts[key] || 0) + 1;
    });

    const commonWindow = Object.entries(windowCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

    document.getElementById('totalCost').textContent = `¥${totalCost.toFixed(2)}`;
    document.getElementById('avgCost').textContent = `¥${avgCost.toFixed(2)}`;
    document.getElementById('avgTime').textContent = commonWindow;
  },

  renderTemplates() {
    const container = document.getElementById('templateList');
    const templates = this.state.templates;

    if (templates.length === 0) {
      container.innerHTML = `
        <div class="empty-state small">
          <p>暂无模板</p>
          <p class="sub-text">点击"新增模板"创建常用异常模板</p>
        </div>
      `;
      return;
    }

    container.innerHTML = templates.map(template => `
      <div class="template-item" data-id="${template.id}">
        <div class="template-info">
          <div class="template-name">
            <span class="template-type-badge template-type-${template.type}">${this.getTemplateTypeLabel(template.type)}</span>
            ${template.name}
          </div>
          <div class="template-content">${template.content}</div>
        </div>
        <div class="template-actions">
          <button class="btn btn-sm btn-secondary" data-action="use" data-id="${template.id}">使用</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-id="${template.id}">删除</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('[data-action="use"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const template = templates.find(t => t.id === id);
        if (template) {
          navigator.clipboard.writeText(template.content);
          this.showToast(`已复制模板内容：${template.name}`, 'success');
        }
      });
    });

    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        this.deleteTemplate(id);
      });
    });
  },

  getTemplateTypeLabel(type) {
    const labels = {
      address: '地址',
      area: '超区',
      weight: '重量',
      duplicate: '重复',
      time: '时效',
      route: '路线'
    };
    return labels[type] || type;
  },

  renderWorkOrders() {
    const container = document.getElementById('workOrderList');
    let workOrders = [...this.state.workOrders];

    if (this.state.exceptionFilter !== 'all') {
      workOrders = workOrders.filter(wo =>
        wo.exceptions.some(e => e.severity === this.state.exceptionFilter)
      );
    }

    if (workOrders.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <p>${this.state.workOrders.length === 0 ? '暂无异常工单' : '没有符合筛选条件的工单'}</p>
          <p class="sub-text">检查异常后将自动生成待处理工单</p>
        </div>
      `;
      return;
    }

    container.innerHTML = workOrders.map(wo => {
      const maxSeverity = wo.exceptions.reduce((max, e) => {
        const order = { high: 3, medium: 2, low: 1 };
        return order[e.severity] > (order[max] || 0) ? e.severity : max;
      }, 'low');

      return `
        <div class="work-order-card ${wo.status}">
          <div class="work-order-header">
            <span class="work-order-waybill">${wo.waybillNumber}</span>
            <span class="work-order-status status-${wo.status}">${this.getStatusLabel(wo.status)}</span>
          </div>
          <div class="work-order-exceptions">
            ${wo.exceptions.map(e => `
              <span class="severity-badge severity-${e.severity}">${this.getSeverityLabel(e.type)}</span>
            `).join('')}
          </div>
          <div class="waybill-detail-row" style="font-size: 12px; margin-bottom: 4px;">
            <span class="waybill-detail-label">地址:</span>
            <span class="waybill-detail-value">${wo.address || '未识别'}</span>
          </div>
          ${wo.remark ? `
          <div class="waybill-detail-row" style="font-size: 12px;">
            <span class="waybill-detail-label">备注:</span>
            <span class="waybill-detail-value" style="color: #2563eb;">${wo.remark}</span>
          </div>
          ` : ''}
          <div class="work-order-actions">
            <button class="btn btn-secondary" data-action="view" data-waybill="${wo.waybillNumber}">查看详情</button>
            ${wo.status === 'pending' ? `
              <button class="btn btn-primary" data-action="process" data-waybill="${wo.waybillNumber}">开始处理</button>
            ` : ''}
            ${wo.status === 'processing' ? `
              <button class="btn btn-success" data-action="complete" data-waybill="${wo.waybillNumber}">标记完成</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-action="view"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const waybillNumber = btn.dataset.waybill;
        this.openWaybillDetail(waybillNumber);
      });
    });

    container.querySelectorAll('[data-action="process"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const waybillNumber = btn.dataset.waybill;
        this.updateWorkOrderStatus(waybillNumber, 'processing');
      });
    });

    container.querySelectorAll('[data-action="complete"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const waybillNumber = btn.dataset.waybill;
        this.updateWorkOrderStatus(waybillNumber, 'completed');
      });
    });

    const pendingCount = this.state.workOrders.filter(w => w.status !== 'completed').length;
    document.getElementById('exceptionCount').textContent = pendingCount > 0 ? pendingCount : '';
    document.getElementById('batchCount').textContent = this.state.waybills.length > 0 ? this.state.waybills.length : '';
  },

  updateStats() {
    const total = this.state.waybills.length;
    let high = 0, medium = 0, low = 0;

    this.state.exceptions.forEach(e => {
      const severities = e.exceptions.map(ex => ex.severity);
      if (severities.includes('high')) high++;
      else if (severities.includes('medium')) medium++;
      else low++;
    });

    document.getElementById('totalCount').textContent = total;
    document.getElementById('highCount').textContent = high;
    document.getElementById('mediumCount').textContent = medium;
    document.getElementById('lowCount').textContent = low;
  },

  populateCarrierSelect() {
    const select = document.getElementById('carrierSelect');
    if (!this.state.settings) return;

    select.innerHTML = '<option value="">自动匹配</option>' +
      this.state.settings.carriers.map(c =>
        `<option value="${c.id}">${c.name}</option>`
      ).join('');
  },

  populateCarrierConfig() {
    const container = document.getElementById('carrierConfigList');
    if (!this.state.settings) return;

    container.innerHTML = this.state.settings.carriers.map(c => `
      <div class="carrier-config-item" data-id="${c.id}">
        <div class="carrier-config-header">
          <span>${c.name}</span>
        </div>
        <div class="carrier-config-fields">
          <div>
            <label style="font-size: 10px; color: #9ca3af;">名称</label>
            <input type="text" class="carrier-name" value="${c.name}">
          </div>
          <div>
            <label style="font-size: 10px; color: #9ca3af;">基础运费</label>
            <input type="number" class="carrier-base-price" value="${c.basePrice}" step="0.5">
          </div>
          <div>
            <label style="font-size: 10px; color: #9ca3af;">续重单价/kg</label>
            <input type="number" class="carrier-price-per-kg" value="${c.pricePerKg}" step="0.1">
          </div>
          <div>
            <label style="font-size: 10px; color: #9ca3af;">限重 (kg)</label>
            <input type="number" class="carrier-weight-limit" value="${c.weightLimit}">
          </div>
        </div>
      </div>
    `).join('');
  },

  openModal(modalId) {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    document.getElementById(modalId).style.display = 'flex';
    document.getElementById('modalOverlay').classList.add('active');
  },

  closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    if (!document.querySelector('.modal[style*="display: flex"]')) {
      document.getElementById('modalOverlay').classList.remove('active');
    }
  },

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  },

  sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  SidebarApp.init();
});
