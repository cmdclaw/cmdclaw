export default async function loadTranslations(locale) {
  try {
    const t = await import(`./_gt/${locale}.json`);
    return t.default;
  } catch (error) {
    console.warn(`Failed to load translations for locale ${locale}:`, error);
    return {};
  }
}
