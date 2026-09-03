export type SiteConfig = {
  name: string;
  description: string;
  url: string;
  author: {
    name: string;
    url: string;
  };
  links: {
    github: string;
  };
  navItems: {
    href: string;
    label: string;
    external?: boolean;
  }[];
};

export const siteConfig: SiteConfig = {
  name: "NotebookLM",
  description: "Queue long-running NotebookLM queries and check in on them by UUID.",
  url: "https://notebooklm.hacolby.workers.dev",
  author: {
    name: "jmbish04",
    url: "https://github.com/jmbish04",
  },
  links: {
    github: "https://github.com/jmbish04/notebooklm",
  },
  navItems: [{ href: "/", label: "Tasks" }],
};
