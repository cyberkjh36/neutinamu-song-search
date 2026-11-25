using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using Mono.Cecil;
using Mono.Cecil.Cil;

// Installer only. Extend the room's own launcher while retaining its other updates.
internal static class DirectLaunchUpgrade {
    const string Marker = "EnablePhoneOnManagerLaunchV1";
    const string Prefix = "WorldKaraokeLauncher.";
    static TypeDefinition Type(ModuleDefinition m, string name) { return m.Types.Single(t => t.FullName == Prefix + name); }
    static bool Calls(Instruction i, string type, string name) {
        var reference = i.Operand as MethodReference;
        return reference != null && reference.DeclaringType.FullName == type && reference.Name == name;
    }
    static void Before(ILProcessor il, Instruction anchor, params Instruction[] added) {
        foreach (var i in added) il.InsertBefore(anchor, i);
    }

    internal static void Install(string root) {
        string file = Path.Combine(root, "app", RoomLaunch.Launcher + ".dll");
        byte[] original = File.ReadAllBytes(file), updated = Apply(original);
        if (Object.ReferenceEquals(original, updated)) return;
        if (RoomLaunch.IsRunning(root))
            throw new IOException("월드가라오케 창을 닫은 뒤 설치를 다시 시도해 주세요.");
        string temp = file + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try {
            File.WriteAllBytes(temp, updated);
            using (var locked = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete))
            using (var hash = SHA256.Create()) {
                byte[] expected = hash.ComputeHash(original);
                if (!hash.ComputeHash(locked).SequenceEqual(expected))
                    throw new IOException("다른 런처 업데이트가 진행 중입니다. 잠시 뒤 다시 시도해 주세요.");
                string backup = file + ".before-manager-" + BitConverter.ToString(expected, 0, 8).Replace("-", "") + ".bak";
                File.Replace(temp, file, File.Exists(backup) ? null : backup);
            }
        } finally { if (File.Exists(temp)) File.Delete(temp); }
    }

    internal static byte[] Apply(byte[] original) {
        using (var input = new MemoryStream(original))
        using (var m = ModuleDefinition.ReadModule(input)) {
            if (m.Assembly.Name.Name != RoomLaunch.Launcher || m.Assembly.Name.HasPublicKey)
                throw new InvalidDataException("지원하는 월드가라오케 런처 파일을 확인해 주세요.");
            var main = Type(m, "KaraokeForm");
            var run = Type(m, "Program").Methods.Single(x => x.Name == "RunWindows");
            if (main.Methods.Any(x => x.Name == Marker) &&
                run.Body.Instructions.Any(i => Calls(i, main.FullName, "PrepareManagerRoomV1"))) return original;
            var modeType = Type(m, "YouTubeUseMode");
            int signIn = Convert.ToInt32(modeType.Fields.Single(f => f.Name == "SignIn" && f.HasConstant).Constant);
            var code = run.Body.Instructions;
            var picker = code.Single(i => i.OpCode == OpCodes.Newobj && Calls(i, Prefix+"YouTubeUseModeForm", ".ctor"));
            var show = code.Single(i => Calls(i, "System.Windows.Forms.Form", "ShowDialog"));
            var pickerEnd = run.Body.ExceptionHandlers.Single(h => h.HandlerType == ExceptionHandlerType.Finally &&
                h.TryStart.Offset <= show.Offset && show.Offset < h.TryEnd.Offset).HandlerEnd;
            var mode = run.Body.Variables.Single(v => v.VariableType.FullName == modeType.FullName);
            var runForm = code.Single(i => Calls(i, "System.Windows.Forms.Application", "Run") && ((MethodReference)i.Operand).Parameters.Count == 1);
            var constructor = code.Single(i => i.OpCode == OpCodes.Newobj && Calls(i, main.FullName, ".ctor"));
            if (picker.Offset >= show.Offset || pickerEnd.Offset > constructor.Offset || constructor.Offset >= runForm.Offset)
                throw new InvalidDataException("런처 시작 방식이 달라 설치를 중단했습니다.");

            var refs = m.GetMemberReferences().OfType<MethodReference>().ToList();
            var environment = m.GetTypeReferences().First(t => t.FullName == "System.Environment");
            var getEnv = new MethodReference("GetEnvironmentVariable", m.TypeSystem.String, environment);
            getEnv.Parameters.Add(new ParameterDefinition(m.TypeSystem.String));
            var equal = refs.First(r => r.DeclaringType.FullName == "System.String" && r.Name == "op_Equality");
            var check = new MethodDefinition("IsManagerRoomStartV1", MethodAttributes.Assembly | MethodAttributes.Static, m.TypeSystem.Boolean);
            main.Methods.Add(check);
            var il = check.Body.GetILProcessor();
            il.Emit(OpCodes.Ldstr, RoomLaunch.ManagerStartVariable); il.Emit(OpCodes.Call, getEnv);
            il.Emit(OpCodes.Ldstr, "1"); il.Emit(OpCodes.Call, equal); il.Emit(OpCodes.Ret);
            var startup = run.Body.GetILProcessor();
            Before(startup, picker, Instruction.Create(OpCodes.Call, check), Instruction.Create(OpCodes.Brfalse, picker),
                Instruction.Create(OpCodes.Ldc_I4, signIn), Instruction.Create(OpCodes.Stloc, mode), Instruction.Create(OpCodes.Br, pickerEnd));

            // Reuse the installed country's normal selection method and phone button handler.
            // The launcher sets selectedCountry on the UI thread before its first awaited browser operation.
            var ctor = main.Methods.Single(x => x.IsConstructor && !x.IsStatic);
            var caption = ctor.Body.Instructions.Single(i => i.OpCode == OpCodes.Ldstr && (string)i.Operand == "휴대폰 마이크 연결 / Phone microphone");
            var callback = caption.Next;
            while (callback != null && callback.OpCode == OpCodes.Ldarg_0) callback = callback.Next;
            if (callback == null || callback.OpCode != OpCodes.Ldftn) throw new InvalidDataException("휴대폰 연결 버튼을 확인할 수 없습니다.");
            var phone = (MethodReference)callback.Operand;
            if (phone.DeclaringType.FullName != main.FullName || phone.Parameters.Count != 2 || phone.ReturnType.FullName != "System.Void")
                throw new InvalidDataException("지원하는 휴대폰 연결 방식이 아닙니다.");
            var profile = Type(m, "LanguageProfile");
            var all = Type(m, "LanguageCatalog").Fields.Single(f => f.Name == "All" && f.FieldType.FullName == profile.FullName+"[]");
            var selected = main.Fields.Single(f => f.Name == "selectedCountry" && f.FieldType.FullName == profile.FullName);
            var selectCountry = main.Methods.Single(x => x.Name == "SelectCountryAsync" && x.Parameters.Count == 1 && x.Parameters[0].ParameterType.FullName == profile.FullName && x.ReturnType.FullName == "System.Threading.Tasks.Task");
            var host = main.Fields.Single(f => f.Name == "phoneSearch");
            var visible = refs.First(r => r.DeclaringType.FullName == "System.Windows.Forms.Control" && r.Name == "get_Visible");
            var shown = new MethodDefinition(Marker, MethodAttributes.Private, m.TypeSystem.Void);
            shown.Parameters.Add(new ParameterDefinition(m.TypeSystem.Object));
            shown.Parameters.Add(new ParameterDefinition(phone.Parameters[1].ParameterType));
            main.Methods.Add(shown);
            var count = new VariableDefinition(m.TypeSystem.Int32); shown.Body.Variables.Add(count); shown.Body.InitLocals = true;
            il = shown.Body.GetILProcessor();
            var open = Instruction.Create(OpCodes.Ldarg_0);
            var invoke = Instruction.Create(OpCodes.Ldarg_0);
            var end = Instruction.Create(OpCodes.Ret);
            var next = Instruction.Create(OpCodes.Ldloc, count);
            var test = Instruction.Create(OpCodes.Ldloc, count);
            var loop = Instruction.Create(OpCodes.Ldsfld, all);
            il.Emit(OpCodes.Ldarg_0); il.Emit(OpCodes.Ldfld, selected); il.Emit(OpCodes.Brtrue, open);
            il.Emit(OpCodes.Br, test); il.Append(loop);
            il.Emit(OpCodes.Ldloc, count); il.Emit(OpCodes.Ldelem_Ref); il.Emit(OpCodes.Ldfld, profile.Fields.Single(f => f.Name=="Hl"));
            il.Emit(OpCodes.Ldstr, "ko"); il.Emit(OpCodes.Call, equal); il.Emit(OpCodes.Brfalse, next);
            il.Emit(OpCodes.Ldarg_0); il.Emit(OpCodes.Ldsfld, all); il.Emit(OpCodes.Ldloc, count); il.Emit(OpCodes.Ldelem_Ref);
            il.Emit(OpCodes.Call, selectCountry); il.Emit(OpCodes.Pop);
            il.Emit(OpCodes.Ldarg_0); il.Emit(OpCodes.Ldfld, selected); il.Emit(OpCodes.Brfalse, end); il.Emit(OpCodes.Br, open);
            il.Append(next); il.Emit(OpCodes.Ldc_I4_1); il.Emit(OpCodes.Add); il.Emit(OpCodes.Stloc, count);
            il.Append(test); il.Emit(OpCodes.Ldsfld, all); il.Emit(OpCodes.Ldlen); il.Emit(OpCodes.Conv_I4);
            il.Emit(OpCodes.Blt, loop); il.Emit(OpCodes.Br, end);
            il.Append(open); il.Emit(OpCodes.Ldfld, host); il.Emit(OpCodes.Brfalse, invoke);
            il.Emit(OpCodes.Ldarg_0); il.Emit(OpCodes.Ldfld, host); il.Emit(OpCodes.Callvirt, visible); il.Emit(OpCodes.Brtrue, end);
            il.Append(invoke); il.Emit(OpCodes.Ldarg_0); il.Emit(OpCodes.Ldarg_2); il.Emit(OpCodes.Call, phone); il.Append(end);

            var prepare = new MethodDefinition("PrepareManagerRoomV1", MethodAttributes.Assembly | MethodAttributes.Static, main);
            prepare.Parameters.Add(new ParameterDefinition(main)); main.Methods.Add(prepare);
            var handler = refs.First(r => r.DeclaringType.FullName == "System.EventHandler" && r.Name == ".ctor");
            var form = ((MethodReference)runForm.Operand).Parameters[0].ParameterType;
            var onShown = new MethodReference("add_Shown", m.TypeSystem.Void, form) { HasThis=true };
            onShown.Parameters.Add(new ParameterDefinition(handler.DeclaringType));
            il = prepare.Body.GetILProcessor();
            var done = Instruction.Create(OpCodes.Ldarg_0);
            il.Emit(OpCodes.Call, check); il.Emit(OpCodes.Brfalse, done);
            il.Emit(OpCodes.Ldarg_0); il.Emit(OpCodes.Ldarg_0); il.Emit(OpCodes.Ldftn, shown);
            il.Emit(OpCodes.Newobj, handler); il.Emit(OpCodes.Callvirt, onShown); il.Append(done); il.Emit(OpCodes.Ret);
            // Put the new call before the loaded form is widened to Form by Application.Run.
            startup.InsertBefore(runForm, Instruction.Create(OpCodes.Call, prepare));
            using (var output = new MemoryStream()) { m.Write(output); return output.ToArray(); }
        }
    }
}
