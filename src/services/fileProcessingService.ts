// src/services/fileProcessingService.ts
export const fileProcessingService = {
  // FileオブジェクトをGemini APIが受け取れる inlineData 形式に変換
  async fileToGenerativePart(file: File) {
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.readAsDataURL(file);
    });

    return {
      inlineData: {
        data: await base64EncodedDataPromise,
        mimeType: file.type
      }
    };
  }
};