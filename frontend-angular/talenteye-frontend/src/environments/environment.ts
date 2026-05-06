
export const environment = {
  production: false,
  apiUrl: 'http://127.0.0.1:8000/api',
  /** Origin for Django MEDIA_URL paths returned as `/media/...` */
  mediaOrigin: 'http://127.0.0.1:8000',
  appName: 'TalentEye Football',
  version: '1.0.0'
};


export const environmentprod = {
  production: true,
  apiUrl: 'https://your-api-domain.com/api',
  mediaOrigin: 'https://your-api-domain.com',
  appName: 'TalentEye Football',
  version: '1.0.0'
};