// 游戏化项目管理系统 - 主JavaScript文件

$(document).ready(function() {
    // 初始化应用
    initializeApp();
});

// 应用初始化
function initializeApp() {
    // 初始化工具提示
    initializeTooltips();

    // 初始化消息提示
    initializeAlerts();

    // 初始化表单验证
    initializeFormValidation();

    // 初始化AJAX设置
    initializeAjax();

    // 加载用户钱包信息
    if (window.user) {
        loadWalletInfo();
    }

    console.log('🎮 游戏化项目管理系统已初始化');
}

// 初始化工具提示
function initializeTooltips() {
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

// 初始化消息提示
function initializeAlerts() {
    // 自动隐藏警告消息
    $('.alert').each(function() {
        const alert = $(this);
        if (alert.hasClass('alert-success') || alert.hasClass('alert-info')) {
            setTimeout(() => {
                alert.fadeOut();
            }, 5000);
        }
    });
}

// 初始化表单验证
function initializeFormValidation() {
    // Bootstrap表单验证
    const forms = document.querySelectorAll('.needs-validation');
    Array.from(forms).forEach(form => {
        form.addEventListener('submit', event => {
            if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            }
            form.classList.add('was-validated');
        });
    });
}

// 初始化AJAX设置
function initializeAjax() {
    // 设置AJAX默认配置
    $.ajaxSetup({
        beforeSend: function(xhr, settings) {
            // 添加CSRF令牌（如果需要）
            const token = $('meta[name="csrf-token"]').attr('content');
            if (token) {
                xhr.setRequestHeader('X-CSRF-TOKEN', token);
            }
        },
        error: function(xhr, status, error) {
            console.error('AJAX错误:', error);
            showAlert('网络请求失败，请稍后重试', 'danger');
        }
    });
}

// 显示消息提示
function showAlert(message, type = 'info', duration = 5000) {
    const alertId = 'alert-' + Date.now();
    const alertHtml = `
        <div id="${alertId}" class="alert alert-${type} alert-dismissible fade show" role="alert">
            <i class="fas fa-${getAlertIcon(type)} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;

    $('#alerts-container').append(alertHtml);

    // 自动隐藏
    if (duration > 0) {
        setTimeout(() => {
            $(`#${alertId}`).fadeOut(() => {
                $(`#${alertId}`).remove();
            });
        }, duration);
    }
}

// 获取警告图标
function getAlertIcon(type) {
    const icons = {
        'success': 'check-circle',
        'danger': 'exclamation-triangle',
        'warning': 'exclamation-circle',
        'info': 'info-circle',
        'primary': 'info-circle',
        'secondary': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// 加载用户钱包信息
function loadWalletInfo() {
    $.get('/api/wallet/balance')
        .done(function(response) {
            if (response.success && response.data) {
                updateWalletDisplay(response.data);
            }
        })
        .fail(function() {
            console.warn('无法加载钱包信息');
        });
}

// 更新钱包显示
function updateWalletDisplay(walletData) {
    $('#diamond-balance').text(walletData.diamondBalance || 0);
    $('#gold-balance').text(walletData.goldBalance || 0);
    $('#silver-balance').text(walletData.silverBalance || 0);
    $('#copper-balance').text(walletData.copperBalance || 0);
}

// 星级评价组件
function renderStarRating(level, maxLevel = 5, size = 'md') {
    let html = '<div class="star-rating star-rating-' + size + '">';

    for (let i = 1; i <= maxLevel; i++) {
        if (i <= level) {
            html += '<i class="fas fa-star star"></i>';
        } else {
            html += '<i class="far fa-star star empty"></i>';
        }
    }

    html += '</div>';
    return html;
}

// 货币显示组件
function renderCurrencyDisplay(amount, currency, showIcon = true) {
    const currencyConfig = {
        diamond: { icon: '💎', class: 'diamond', name: '钻石' },
        gold: { icon: '🥇', class: 'gold', name: '金币' },
        silver: { icon: '🥈', class: 'silver', name: '银币' },
        copper: { icon: '🥉', class: 'copper', name: '铜币' }
    };

    const config = currencyConfig[currency] || currencyConfig.gold;

    let html = '<div class="currency-display">';
    if (showIcon) {
        html += `<span class="currency-icon ${config.class}">${config.icon}</span>`;
    }
    html += `<span class="currency-amount">${amount.toLocaleString()}</span>`;
    html += `<span class="currency-name">${config.name}</span>`;
    html += '</div>';

    return html;
}

// 技能等级徽章
function renderSkillBadge(skillLevel) {
    const skillConfig = {
        novice: { icon: '🔰', name: '新手', class: 'novice' },
        bronze: { icon: '🥉', name: '铜牌', class: 'bronze' },
        silver: { icon: '🥈', name: '银牌', class: 'silver' },
        gold: { icon: '🥇', name: '金牌', class: 'gold' },
        diamond: { icon: '💎', name: '钻石', class: 'diamond' }
    };

    const config = skillConfig[skillLevel] || skillConfig.novice;

    return `<span class="skill-badge ${config.class}">
        <span>${config.icon}</span>
        <span>${config.name}</span>
    </span>`;
}

// 紧急程度徽章
function renderUrgencyBadge(urgencyLevel) {
    const urgencyConfig = {
        urgent: { icon: '🔥', name: '紧急', class: 'urgent' },
        important: { icon: '⚡', name: '重要', class: 'important' },
        normal: { icon: '📅', name: '普通', class: 'normal' },
        delayed: { icon: '🕐', name: '延后', class: 'delayed' },
        frozen: { icon: '❄️', name: '冻结', class: 'frozen' }
    };

    const config = urgencyConfig[urgencyLevel] || urgencyConfig.normal;

    return `<span class="urgency-badge ${config.class}">
        <span>${config.icon}</span>
        <span>${config.name}</span>
    </span>`;
}

// 格式化时间
function formatTime(date, format = 'relative') {
    if (!date) return '-';

    const now = new Date();
    const target = new Date(date);

    if (format === 'relative') {
        const diff = target - now;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        if (days > 0) {
            return `${days}天后`;
        } else if (days === 0 && hours > 0) {
            return `${hours}小时后`;
        } else if (days === 0 && hours <= 0) {
            return '即将到期';
        } else {
            return `已逾期${Math.abs(days)}天`;
        }
    } else {
        return target.toLocaleDateString('zh-CN');
    }
}

// 加载状态管理
function setLoading(element, loading = true) {
    const $element = $(element);

    if (loading) {
        $element.addClass('loading');
        $element.prop('disabled', true);

        // 如果是按钮，添加加载图标
        if ($element.is('button') || $element.hasClass('btn')) {
            const originalText = $element.data('original-text') || $element.html();
            $element.data('original-text', originalText);
            $element.html('<i class="fas fa-spinner fa-spin me-2"></i>加载中...');
        }
    } else {
        $element.removeClass('loading');
        $element.prop('disabled', false);

        // 恢复按钮原始文本
        if ($element.is('button') || $element.hasClass('btn')) {
            const originalText = $element.data('original-text');
            if (originalText) {
                $element.html(originalText);
            }
        }
    }
}

// 确认对话框
function confirmAction(message, callback) {
    if (confirm(message)) {
        callback();
    }
}

// 复制到剪贴板
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showAlert('已复制到剪贴板', 'success', 2000);
    }).catch(() => {
        showAlert('复制失败', 'danger', 2000);
    });
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 节流函数
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// 全局错误处理
window.addEventListener('error', function(e) {
    console.error('全局错误:', e.error);
    showAlert('系统出现错误，请刷新页面重试', 'danger');
});

// 导出全局函数
window.KanbanApp = {
    showAlert,
    renderStarRating,
    renderCurrencyDisplay,
    renderSkillBadge,
    renderUrgencyBadge,
    formatTime,
    setLoading,
    confirmAction,
    copyToClipboard,
    debounce,
    throttle,
    updateWalletDisplay
};
