declare module "heic2any" {
  interface Heic2anyOptions {
    blob: Blob;
    toType?: string;
    quality?: number;
  }
  export default function heic2any(options: Heic2anyOptions): Promise<Blob | Blob[]>;
}
