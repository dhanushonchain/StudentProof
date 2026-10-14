export function MinimalFooter() {
  const year = new Date().getFullYear();

  const resources = [
    { title: "Docs", href: "/docs" },
    { title: "SDK", href: "/sdk" },
  ];

  const company = [
    { title: "About our Vision", href: "/aov", soon: true }, 
    { title: "Privacy Policy", href: "/privacy", soon: true },
    { title: "Terms of Service", href: "/terms", soon: true },
  ];

  const socialLinks = [
    {
      icon: (
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
      ),
      link: "https://github.com/dhanush-devx/StudentProof.git",
      label: "StudentProof on GitHub",
    },
    {
      icon: (
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      link: "https://x.com/StudentProofapp",
      label: "StudentProof on X",
    },
  ];

  return (
    <footer className="relative w-full bg-black bg-[radial-gradient(900px_circle_at_0%_0%,rgba(245,158,11,0.15),transparent)]">
      <div className="bg-zinc-800 h-px w-full" />
      
      <div className="grid grid-cols-6 gap-8 px-6 py-8 md:px-16">
        <div className="col-span-6 flex flex-col gap-5 md:col-span-4">
          <p className="text-neutral-400 max-w-sm font-mono text-sm text-balance">
            Reusable, privacy-first student verification.
          </p>
          <div className="flex gap-2">
            {socialLinks.map((item, i) => (
              <a
                key={i}
                className="hover:bg-zinc-800 text-neutral-400 hover:text-white rounded-md border border-zinc-800 p-1.5 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
                href={item.link}
                aria-label={item.label}
              >
                {item.icon}
              </a>
            ))}
          </div>
        </div>
        <div className="col-span-3 w-full md:col-span-1">
          <span className="text-neutral-500 mb-1 text-xs">Resources</span>
          <div className="flex flex-col gap-1">
            {resources.map(({ href, title }, i) => (
              <a key={i} className="text-neutral-300 hover:text-white w-max py-1 text-sm duration-200 hover:underline" href={href}>
                {title}
              </a>
            ))}
          </div>
        </div>
        <div className="col-span-3 w-full md:col-span-1">
          <span className="text-neutral-500 mb-1 text-xs">Company</span>
          <div className="flex flex-col gap-1">
            {company.map(({ href, title, soon }, i) =>
              soon ? (
                <span key={i} className="text-neutral-600 w-max py-1 text-sm">
                  {title} <span className="ml-1 rounded-full border border-zinc-700 px-1.5 py-0.5 text-[10px]">soon</span>
                </span>
              ) : (
                <a key={i} className="text-neutral-300 hover:text-white w-max py-1 text-sm duration-200 hover:underline" href={href}>
                  {title}
                </a>
              )
            )}
          </div>
        </div>
      </div>

      <div className="bg-zinc-800 h-px w-full" />
      
      <div className="flex flex-col justify-between gap-2 px-6 py-6 md:px-16">
        <p className="text-neutral-500 text-center font-thin">© StudentProof. All rights reserved {year}</p>
      </div>
    </footer>
  );
}