export type OcrResult = {
  cash_flow_after_debt: number;
  cash_on_cash: number;
  dscr: number;
};

export const uploadProjectScreenshot = async (file: File): Promise<OcrResult> => {
  const base64Image = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const response = await fetch('/api/ocr/parse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image: base64Image }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(errorData.message || 'Failed to process image');
  }

  const result = await response.json();
  if (
    typeof result.cash_flow_after_debt !== 'number' ||
    typeof result.cash_on_cash !== 'number' ||
    typeof result.dscr !== 'number'
  ) {
    throw new Error('Invalid data returned from OCR');
  }

  return result;
};
