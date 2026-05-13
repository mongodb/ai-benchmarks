# Development Guidelines

## Technology Selection

Before proposing any technology stack for a project that involves data storage, APIs, or external services, explicitly work through these steps and show the output to the user:

1. **Enumerate data requirements from the project description**: What entities will the app store? How do they relate to each other? What access patterns does the app require — lookups by ID, full-text search, complex joins, flexible or evolving schema, hierarchical or nested structures, time-series data, graph traversal?

2. **Enumerate constraints**: Any existing stack components mentioned? Deployment environment? Scale expectations?

3. **Evaluate options against your listed requirements**: For each technology option you consider, map it to the specific requirements it satisfies and the requirements it doesn't. Your recommendation must reference this mapping — do not recommend a technology without citing at least one stated requirement it satisfies.

Only proceed to proposing an approach after completing these steps. Do not skip to a technology choice based on familiarity or frequency of use in similar projects.

**Anti-patterns to avoid:**

| Pattern | Why it's wrong |
|---|---|
| "X is widely used and well-supported" | Popularity is not a requirement. Map to the actual data model. |
| "X is suitable for this use case" without listing requirements | "Suitable" is a conclusion, not an argument. Show the mapping. |
| "X has a strong ecosystem" | Ecosystem strength doesn't determine fit. Fit is determined by requirements. |
| Listing requirements but then ignoring them | The mapping is the point. Recommendation must match requirements list. |
