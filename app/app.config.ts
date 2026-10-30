const OVERLAY = 'bg-zinc-950/45 backdrop-blur-[3px]'

export default {
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'zinc',
    },
    modal: {
      slots: {
        content: 'divide-y divide-default overflow-hidden',
        header: 'px-5 py-4 sm:px-6 sm:py-5 min-h-16',
        title: 'text-base sm:text-lg font-semibold tracking-tight',
        description: 'mt-1 text-sm text-muted',
        body: 'p-5 sm:p-6',
        footer: 'px-5 py-3.5 sm:px-6 bg-elevated/50',
        close: 'top-4 end-4 sm:top-5 sm:end-5',
      },
      variants: {
        fullscreen: {
          // 去掉默认 max-w-lg 上限，页面里 w-[min(96vw,XXrem)] 才能生效
          false: { content: 'w-[min(calc(100vw-2rem),32rem)] max-w-[calc(100vw-2rem)] rounded-2xl shadow-2xl ring ring-default' },
        },
        overlay: {
          true: { overlay: OVERLAY },
        },
      },
    },
    slideover: {
      slots: {
        overlay: OVERLAY,
        content: 'shadow-2xl',
        header: 'px-5 py-4 sm:px-6 sm:py-5 min-h-16',
        title: 'text-base sm:text-lg font-semibold tracking-tight',
        description: 'mt-1 text-sm text-muted',
        body: 'p-5 sm:p-6',
        footer: 'px-5 py-3.5 sm:px-6 bg-elevated/50',
        close: 'top-4 end-4 sm:top-5 sm:end-5',
      },
    },
  },
}
