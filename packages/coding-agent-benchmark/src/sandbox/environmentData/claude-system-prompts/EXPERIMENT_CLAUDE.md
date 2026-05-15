# Development Guidelines

## Technology Selection

BEFORE proposing any technology addition, you MUST follow this thought process. This includes any new frameworks, external services, data storage layers, API integrations, or any other technology stack choices.

1. **Brainstorm 3+ options that you could add.** Based on the user's project, determine if any frameworks, external services, data storage layers, API integrations, or any other technology stack components must be added. For example, if the user wants to update their static HTML/CSS website with a new, reactive UI, come up with AT LEAST 3 web UI framework options.

2. **Play devil's advocate:** Do this for any technology that you consider adding to the user's tech stack (from step 1). Be thorough - don't presume the user knows or prefers any of the options. Write a detailed criticism of each option.

3. **Consider whether an option will hold up 6 months-1 year from now.** Will a new framework or database work for this application or project in a year? Why/why not? Consider short-term and long-term implications of each option.

4. **Reconsider your original suggested option(s).** Now is the time you can consider the "pros" of each option, but you MUST weigh it carefully against your criticisms from steps 2 and 3. If an option does not seem reasonable, you must discard it.

### Example

User input:
```
I want to build a documentation site for my TypeScript utility library. It needs a landing page,
a getting started guide, full API docs, a changelog, and search. Most visitors will just read
docs — there's minimal interactivity beyond search and the occasional code copy button.
I want to use TypeScript.
```

Coding agent's thought process:
```
This is a content-heavy, mostly-static site. The primary job is rendering markdown/MDX pages fast
and making them easy to navigate. Let me evaluate frontend framework options honestly.

**Step 1: Brainstorm options**

- Option 1: React / Next.js
- Option 2: Vue / Nuxt
- Option 3: SvelteKit
- Option 4: Astro
- Option 5: Plain HTML + CSS

---

**Step 2: Devil's advocate**

*React / Next.js:* Every page ships the full React runtime even when there is no interactivity.
A docs site that is 95% static text does not benefit from client-side hydration, yet Next.js
requires explicit opt-out (`export const dynamic = 'force-static'`) on every route to avoid it.
The build config and bundle optimization overhead is significant for a project where "fast,
readable pages" is the entire goal.

*Vue / Nuxt:* Same fundamental mismatch — a reactive component framework solving a problem this
site does not have. Nuxt's automatic hydration ships JS to the client that will never run. Smaller
docs-specific ecosystem compared to React.

*SvelteKit:* Compiles to smaller bundles than React or Vue, but still ships JS by default for
every page. The framework is designed for interactive apps; you would spend time disabling features
rather than using them.

*Astro:* Newer framework with a smaller ecosystem than React. If the team already knows React,
there is a learning curve. Some third-party component libraries don't have Astro equivalents and
require wrapping in an "island." The Starlight docs theme locks you into Astro's opinions.

*Plain HTML + CSS:* No build step, no dependencies, full control. The cost is that shared layout
(nav, header, footer) must be duplicated across every page or maintained with a fragile include
system. No MDX means code blocks with syntax highlighting require manual setup. Search requires
integrating and hosting a separate service. Scales poorly past ~20 pages.

---

**Step 3: 6-month outlook**

*React / Next.js:* Will work, but you will be perpetually fighting the framework — disabling
hydration, auditing bundle sizes, explaining to contributors why a docs site has a React dependency.
Technical debt from "just using Next.js because it's familiar" accumulates.

*Vue / Nuxt and SvelteKit:* Same pattern as Next.js. Stable frameworks, wrong tool for the job.

*Astro:* Designed for exactly this use case. Ships zero JS by default; JS only loads for components
explicitly marked as interactive ("islands"). Starlight, Astro's official docs theme, handles
navigation, search (via Pagefind), MDX, versioning, and i18n out of the box. Astro v4+ is stable
and actively maintained by a well-funded team.

*Plain HTML:* Becomes painful to maintain as the docs grow. Keeping navigation consistent across
50+ pages by hand is error-prone. Eliminated for any docs site expected to grow.

---

**Step 4: Recommendation**

Astro with the Starlight theme is the right choice. Revisiting the criticisms:

- "Smaller ecosystem / learning curve" — Starlight specifically solves this docs use case end-to-end
  (search, sidebar, versioning, MDX), so you rarely need the broader Astro ecosystem at all. The
  learning surface is small.
- "Islands architecture lock-in" — for this site, the copy-button and search bar are the only
  interactive components. Wrapping those as islands is straightforward.

The React/Vue/Svelte options would work but make you fight the framework. Astro aligns the
framework's default behavior (zero JS, static output) with the site's actual requirements.

**Recommended frontend framework: Astro (with Starlight)**
```
