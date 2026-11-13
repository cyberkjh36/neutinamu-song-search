using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

internal static class BluetoothCode
{
    // In the .83 BluetoothSearchHub constructor this is the default value used
    // only when the caller supplies no code. Explicit codes keep their behavior.
    const string OriginalHash = "cb576b719cce0f9fc477e43d2694c4571fc612acc5dbc50d50e6da9f6bcc5371";
    const int DefaultCodeOffset = 16087;
    static readonly byte[] RandomDefault = { 0x20, 0xa0, 0x86, 0x01, 0x00, 0x20, 0x40, 0x42, 0x0f, 0x00, 0x28, 0xfc, 0x00, 0x00, 0x0a };
    const string MainFile = "WorldKaraokeYouTubeLauncher.dll";

    internal static bool Valid(string value) => value != null && value.Length == 6 &&
        value[0] >= '1' && value[0] <= '9' && value.All(c => c >= '0' && c <= '9');

    internal static string NewCode()
    {
        const uint range = 900000;
        var bytes = new byte[4];
        using (var random = RandomNumberGenerator.Create())
        {
            uint sample;
            do { random.GetBytes(bytes); sample = BitConverter.ToUInt32(bytes, 0); }
            while (sample >= uint.MaxValue - uint.MaxValue % range);
            return (100000 + sample % range).ToString(CultureInfo.InvariantCulture);
        }
    }

    internal static string Inspect(byte[] image)
    {
        if (HasOriginalHash(image)) return null;
        if (image.Length == 357376 && image[DefaultCodeOffset] == 0x20)
        {
            var code = BitConverter.ToInt32(image, DefaultCodeOffset + 1).ToString(CultureInfo.InvariantCulture);
            if (Valid(code) && image.Skip(DefaultCodeOffset + 5).Take(10).All(b => b == 0))
            {
                var original = (byte[])image.Clone();
                Array.Copy(RandomDefault, 0, original, DefaultCodeOffset, RandomDefault.Length);
                if (HasOriginalHash(original)) return code;
            }
        }
        throw new InvalidDataException("이 업데이트는 월드유튜브 런처 1.3.57.83 설치본에 적용할 수 있습니다.");
    }

    static bool HasOriginalHash(byte[] image)
    {
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(image)).Replace("-", "").ToLowerInvariant() == OriginalHash;
    }

    internal static byte[] Apply(byte[] original, string code)
    {
        var previous = Inspect(original);
        if (!Valid(code)) throw new InvalidDataException("블루투스 번호는 100000부터 999999까지의 여섯 자리입니다.");
        if (previous == code) return original;
        if (previous != null) throw new InvalidDataException("이미 저장한 블루투스 번호가 있습니다.");
        var updated = (byte[])original.Clone();
        // Replace the random integer expression with the saved integer. Keep the
        // existing conversion, getter, UI, comparison and explicit-code branch.
        Array.Clear(updated, DefaultCodeOffset + 5, 10);
        Buffer.BlockCopy(BitConverter.GetBytes(int.Parse(code, CultureInfo.InvariantCulture)), 0, updated, DefaultCodeOffset + 1, 4);
        return updated;
    }

    internal static string Existing(string app, string settingsFile)
    {
        var active = Inspect(File.ReadAllBytes(Path.Combine(app, MainFile)));
        if (!File.Exists(settingsFile)) return active;
        var saved = File.ReadAllText(settingsFile, Encoding.ASCII).Trim();
        if (!Valid(saved)) throw new InvalidDataException("저장한 블루투스 번호의 형식을 확인해 주세요.");
        if (active != null && active != saved) throw new InvalidDataException("이 설치본과 PC에 저장한 블루투스 번호가 서로 다릅니다.");
        return saved;
    }

    internal static void Install(string app, string settingsFile, string code)
    {
        var current = Existing(app, settingsFile);
        if (current != null && current != code) throw new InvalidOperationException("이미 저장한 블루투스 번호가 있습니다.");
        var path = Path.Combine(app, MainFile);
        var original = File.ReadAllBytes(path);
        var updated = Apply(original, code);
        // Save first so an interrupted installation can retry with the same code.
        if (!File.Exists(settingsFile))
        {
            Directory.CreateDirectory(Path.GetDirectoryName(settingsFile));
            Setup.WriteAtomically(settingsFile, Encoding.ASCII.GetBytes(code));
        }
        if (!Object.ReferenceEquals(updated, original))
            Setup.WriteAtomically(path, updated);
    }
}
