// Extend Bun namespace with properties missing from bun-types
declare module "bun" {
  export const cwd: string
}
