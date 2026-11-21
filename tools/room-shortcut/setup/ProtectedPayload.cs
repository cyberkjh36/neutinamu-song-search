using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

internal static class ProtectedPayload
{
    const int SaltSize = 16, IvSize = 16, TagSize = 32;
    const int Iterations = 310000;
    static readonly byte[] Format = Encoding.ASCII.GetBytes("P2UPD001");

    internal static byte[] Read(string password)
    {
        using (var stream = typeof(ProtectedPayload).Assembly.GetManifestResourceStream("update.protected"))
        using (var buffer = new MemoryStream())
        {
            if (stream == null) throw new InvalidDataException();
            stream.CopyTo(buffer);
            return Decrypt(buffer.ToArray(), password);
        }
    }

    internal static byte[] Decrypt(byte[] package, string password)
    {
        if (string.IsNullOrEmpty(password)) return null;
        int start = Format.Length + SaltSize + IvSize;
        int end = package.Length - TagSize;
        if (end <= start || (end - start) % 16 != 0 || !package.Take(Format.Length).SequenceEqual(Format))
            throw new InvalidDataException();
        var salt = new byte[SaltSize];
        var iv = new byte[IvSize];
        Buffer.BlockCopy(package, Format.Length, salt, 0, SaltSize);
        Buffer.BlockCopy(package, Format.Length + SaltSize, iv, 0, IvSize);
        using (var keys = new Rfc2898DeriveBytes(password, salt, Iterations, HashAlgorithmName.SHA256))
        {
            byte[] encryptionKey = keys.GetBytes(32), authenticationKey = keys.GetBytes(32);
            try
            {
                using (var hmac = new HMACSHA256(authenticationKey))
                {
                    byte[] tag = hmac.ComputeHash(package, 0, end);
                    int mismatch = 0;
                    for (int i = 0; i < TagSize; i++) mismatch |= tag[i] ^ package[end+i];
                    if (mismatch != 0) return null;
                }
                using (var aes = Aes.Create())
                {
                    aes.Mode = CipherMode.CBC;
                    aes.Padding = PaddingMode.PKCS7;
                    using (var cipher = aes.CreateDecryptor(encryptionKey, iv))
                        return cipher.TransformFinalBlock(package, start, end-start);
                }
            }
            finally
            {
                Array.Clear(encryptionKey, 0, encryptionKey.Length);
                Array.Clear(authenticationKey, 0, authenticationKey.Length);
            }
        }
    }
}
