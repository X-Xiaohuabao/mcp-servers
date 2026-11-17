/**
 * jsDesign 插件沙箱全局对象环境声明。
 * 只声明本仓用到的方法（均经控制台/探针面板实测，见 docs/api-notes.md）；未实测 API 不声明。
 */

/** 画布沙箱主线程全局（main.ts 侧） */
declare const jsDesign: {
  showUI(uiFile: unknown, options?: { width?: number; height?: number }): void;
  /** 文档根节点（实测探针⑥：root.children 为页面列表，jsDesign.pages 不存在） */
  root: { children?: unknown };
  /** 当前页面（实测探针②：currentPage.selection[0] 取到选中节点，getCSSAsync 探针经此路径执行成功） */
  currentPage: { selection?: unknown };
  /** 实测探针⑤：按 id 直查节点，Promise<node|null> */
  getNodeByIdAsync(id: string): Promise<unknown>;
  ui: {
    postMessage(message: unknown): void;
    onmessage: ((message: unknown) => void) | null;
  };
};

/** manifest ui 指向的 html 文件引用（showUI 第一参数） */
declare const __html__: string;
