import axios from 'axios';

export async function checkHttpStatus(url: string): Promise<number> {
  try {
    const response = await axios.head(url, {timeout: 10000});
    return response.status;
  } catch (err) {
    return err.response?.status || 500;
  }
}
{
}
