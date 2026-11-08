// app/login.tsx
// Registro e inicio de sesión. No navega a mano: al cambiar la sesión, Stack.Protected cambia de pantalla.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (action: typeof signIn) => {
    if (!email.trim() || password.length < 6) {
      return setMessage('Escribe tu correo y una contraseña de al menos 6 caracteres.');
    }
    setBusy(true);
    setMessage(await action(email, password));
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 justify-center gap-3 bg-neutral-950 px-6"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text className="text-3xl font-bold text-white">GeoCam</Text>
      <Text className="mb-4 text-neutral-400">Inicia sesión para respaldar tus fotos en la nube.</Text>

      <TextInput
        className="rounded-xl bg-neutral-900 p-3 text-base text-white"
        placeholder="Correo"
        placeholderTextColor="#737373"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className="rounded-xl bg-neutral-900 p-3 text-base text-white"
        placeholder="Contraseña"
        placeholderTextColor="#737373"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {message && <Text className="text-red-400">{message}</Text>}

      <Pressable
        className={`items-center rounded-xl bg-emerald-500 p-3 ${busy ? 'opacity-60' : ''}`}
        disabled={busy}
        onPress={() => submit(signIn)}
        accessibilityRole="button"
      >
        <Text className="font-semibold text-neutral-950">Iniciar sesión</Text>
      </Pressable>
      <Pressable className="items-center p-2" disabled={busy} onPress={() => submit(signUp)} accessibilityRole="button">
        <Text className="text-neutral-300">Crear cuenta</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}
