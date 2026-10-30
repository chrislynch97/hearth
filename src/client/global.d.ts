// Ambient declaration so TypeScript accepts CSS side-effect imports
// (e.g. "./design-system.css") under verbatimModuleSyntax + moduleResolution:Bundler.
declare module '*.css' {}
