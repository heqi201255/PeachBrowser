const translations = {
  'zh-CN': window.zhCN,
  'en-US': window.enUS,
  'ja-JP': window.jaJP
};

const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US', 'ja-JP'];
const LANGUAGE_KEY = 'peechbrowser_language';

let currentLanguage = null;

function detectLanguage() {
  const saved = localStorage.getItem(LANGUAGE_KEY);
  if (saved && SUPPORTED_LANGUAGES.includes(saved)) {
    return saved;
  }
  
  const userLang = navigator.language || navigator.userLanguage;
  const langCode = userLang ? userLang.toLowerCase() : '';
  
  if (langCode.startsWith('zh') || langCode.includes('cn')) {
    return 'zh-CN';
  }
  
  if (langCode.startsWith('ja') || langCode.includes('jp')) {
    return 'ja-JP';
  }
  
  return 'en-US';
}

function setLanguage(lang) {
  if (!SUPPORTED_LANGUAGES.includes(lang)) {
    console.warn(`Unsupported language: ${lang}, falling back to en-US`);
    lang = 'en-US';
  }
  
  currentLanguage = lang;
  localStorage.setItem(LANGUAGE_KEY, lang);
  document.documentElement.lang = lang;
  
  window.dispatchEvent(new CustomEvent('language-change', { detail: { language: lang } }));
  
  return lang;
}

function t(key, params = {}) {
  if (!currentLanguage) {
    currentLanguage = detectLanguage();
  }
  
  const keys = key.split('.');
  let value = translations[currentLanguage];
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      value = null;
      break;
    }
  }
  
  if (value === null) {
    value = translations['en-US'];
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return key;
      }
    }
  }
  
  if (typeof value !== 'string') {
    return key;
  }
  
  return value.replace(/\{(\w+)\}/g, (match, param) => {
    return params[param] !== undefined ? params[param] : match;
  });
}

function getAvailableLanguages() {
  return [
    { code: 'auto', name: t('settings.languageAuto') },
    { code: 'zh-CN', name: t('settings.languageZh') },
    { code: 'en-US', name: t('settings.languageEn') },
    { code: 'ja-JP', name: t('settings.languageJa') }
  ];
}

function getCurrentLanguage() {
  if (!currentLanguage) {
    currentLanguage = detectLanguage();
  }
  return currentLanguage;
}
