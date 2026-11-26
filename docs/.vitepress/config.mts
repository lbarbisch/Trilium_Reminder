import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Trilium Reminder',
  base: '/Trilium_Reminder/',
  themeConfig: {
    nav: [{ text: 'Manual', link: '/manual/install' }],
    sidebar: [
      {
        text: 'Manual',
        items: [
          { text: 'Installation', link: '/manual/install' },
          { text: 'Trilium setup', link: '/manual/trilium-setup' },
          { text: 'Daily use', link: '/manual/usage' },
          { text: 'Linux', link: '/manual/linux' },
          { text: 'Troubleshooting', link: '/manual/troubleshooting' },
          { text: 'Development', link: '/manual/development' },
        ],
      },
    ],
    search: { provider: 'local' },
  },
});
