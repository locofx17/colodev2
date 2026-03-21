import CryptoJS from 'crypto-js';

const SECRET_KEY = 'deriv-copy-trading-secret-key'; // In a real app, this should be an env var

export const encrypt = (text: string): string => {
  return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
};

export const decrypt = (ciphertext: string): string => {
  const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
};
