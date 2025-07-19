import axios from 'axios';

export async function checlHttpStatus(url: string): Promise<number> {
  try {
    const response = await axios.head(url, {timeout: 5000});
    return response.status;
  } catch (err) {
    return err.response?.status || 500;
  }
}
{
}
