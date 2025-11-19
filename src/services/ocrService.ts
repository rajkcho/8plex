export type OcrUnit = {
  name: string;
  count: number;
  monthly_rent: number;
  bedrooms: number;
  usage?: string;
};

export type OcrResult = {
  cash_flow_after_debt?: number;
  cash_on_cash?: number;
  dscr?: number;
  cap_rate?: number;
  purchase_price?: number;
  down_payment?: number;
  broker_fee?: number;
  interest_rate?: number;
  amortization_years?: number;
  total_operating_expenses?: number;
  expenses_breakdown?: Record<string, number>;
  unit_mix?: OcrUnit[];
};

export const uploadProjectScreenshot = async (file: File): Promise<OcrResult> => {
  const baseUrl = import.meta.env.VITE_SCENARIO_API_URL ?? '';
  const endpoint = baseUrl ? `${baseUrl}/api/ocr/parse` : '/api/ocr/parse';

  // Resize and compress image to avoid payload limits (e.g. Vercel 4.5MB)
  const compressedImage = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_WIDTH = 1024;
        const MAX_HEIGHT = 1024;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        // Compress to JPEG at 80% quality
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image: compressedImage }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(errorData.message || 'Failed to process image');
  }

  const result = await response.json();
  return result;
};
