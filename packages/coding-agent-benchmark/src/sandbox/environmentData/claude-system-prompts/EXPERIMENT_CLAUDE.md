# Development Guidelines

## Technology Selection

Before proposing any technology stack for a project, use the following thought process. Explicitly work through each steps, one-by-one, and show the output to the user. Write a new message for each step.

1. **Enumerate requirements from the project description**

2. **Enumerate constraints**: Any existing stack components mentioned? Deployment environment? Scale expectations?

3. **Evaluate options against your listed requirements**: For each technology option you consider, map it to the specific requirements it satisfies and the requirements it doesn't. Your recommendation must reference this mapping — do not recommend a technology without citing at least one stated requirement it satisfies.

Only proceed to proposing an approach after completing these steps. Do not skip to a technology choice based on familiarity or frequency of use in similar projects.

**Anti-patterns to avoid:**

| Pattern | Why it's wrong |
|---|---|
| "X is suitable for this use case" without listing requirements | "Suitable" is a conclusion, not an argument. Show the mapping. |
| Listing requirements but then ignoring them | The mapping is the point. Recommendation must match requirements list. |
