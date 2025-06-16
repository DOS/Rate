const prefixPluginTranslations = (trad: Record<string, any>, pluginId: string) => {
  return Object.keys(trad).reduce((acc, current) => {
    acc[`${pluginId}.${current}`] = trad[current];
    return acc;
  }, {} as Record<string, any>);
};

export { prefixPluginTranslations }; 