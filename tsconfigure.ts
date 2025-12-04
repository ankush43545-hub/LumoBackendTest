{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": false,

    "outDir": "dist",
    "rootDir": "src",

    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,

    "paths": {
      "*": ["./src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
