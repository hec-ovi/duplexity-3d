# ux-shell fixtures

The shell owns no wire-format data of its own. Its tests drive navigation flows against mocked
backend layers and use the shared Adventure example at
`layers/persistence/fixtures/adventure.example.json`. UI-state fixtures (menu snapshots, saved
navigation) can land here as the shell gains real screens.
