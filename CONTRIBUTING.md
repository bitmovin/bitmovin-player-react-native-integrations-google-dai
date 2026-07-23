# Contributing

Thanks for contributing to this project. Your time and input are appreciated.

## Code of Conduct

Please note we have a [Code of Conduct](CODE_OF_CONDUCT.md). Follow it in all interactions with the project.

## Issues

For bugs and problems, describe the issue in enough detail for maintainers to reproduce it. Include the affected platform, package versions, reproduction steps, expected behavior, and actual behavior.

## Pull Request Process

Pull requests are welcome and pair well with bug reports and feature requests. Before submitting a PR:

- Fork the repository to your own account if you have not already.
- Develop in a fix or feature branch, not in `main` or `development`.
- Keep changes focused and avoid unrelated refactors.
- Update documentation when behavior or setup changes.
- Run the relevant validation commands locally.
- Submit a pull request to the main repository.

All additions, modifications, and fixes will be reviewed. The project owners reserve the right to reject pull requests that do not meet project standards.

## Development Workflow

Use Yarn for development. From the repository root, install dependencies and run the package checks:

```sh
yarn install
yarn build
yarn lint
yarn typecheck
```

If your change affects native code, validate the affected platform with the documented native or example-app workflow. If your change affects the example app, run the example checks documented under `example/`.

## Code Style

- Follow the configured ESLint and TypeScript rules.
- Use Prettier formatting.
- Keep public APIs typed and documented where helpful.
- Avoid unused imports and dead code.
- Do not commit secrets, license keys, generated local build output, or machine-specific files.

## License

By contributing, you agree that your contributions are licensed under the repository's [MIT License](LICENSE).
