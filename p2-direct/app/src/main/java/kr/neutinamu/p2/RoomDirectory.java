package kr.neutinamu.p2;

import android.content.Intent;
import android.net.Uri;
import java.io.*;
import java.util.*;
import java.util.regex.*;

/** Display aliases only. The Wi-Fi peer address remains the connection identity. */
final class RoomDirectory {
    private final Map<String,String> devices=new LinkedHashMap<>();
    private static final Pattern LINE=Pattern.compile("([1-9][0-9]?)번(?:방)?[ \\t]+(TJ_P2_[A-Za-z0-9_]+)");
    private static final Pattern LONG_RADIO_NAME=Pattern.compile("TJ_P2_P020([0-9]{7}_[0-9]+_B)");
    static RoomDirectory read(Reader source)throws IOException {
        RoomDirectory result=new RoomDirectory();Set<String> names=new HashSet<>();
        BufferedReader reader=new BufferedReader(source);String line;
        while((line=reader.readLine())!=null){
            line=line.replace("\uFEFF","").trim();if(line.isEmpty())continue;
            Matcher match=LINE.matcher(line);if(!match.matches())throw new IOException("Invalid room mapping");
            String room=match.group(1),name=normalize(match.group(2));
            if(result.devices.containsKey(room)||!names.add(discoveryKey(name)))throw new IOException("Duplicate room mapping");
            result.devices.put(room,name);
        }
        return result;
    }
    static String normalize(String name){return name==null?"":name.trim().toUpperCase(Locale.ROOT);}
    // The radio advertises the seven-digit serial without the P020 model prefix.
    // Canonicalize discovery only: the original full serial is still used for protocol verification.
    static String discoveryKey(String name){
        String normalized=normalize(name);
        Matcher match=LONG_RADIO_NAME.matcher(normalized);
        return match.matches()?"TJ_P2_"+match.group(1):normalized;
    }
    String device(String room){return devices.get(room);}
    boolean containsDevice(String name){return devices.values().stream().anyMatch(device->discoveryKey(device).equals(discoveryKey(name)));}
    String room(DirectWifi.Peer peer){
        for(Map.Entry<String,String> entry:devices.entrySet())if(discoveryKey(entry.getValue()).equals(discoveryKey(peer.name)))return entry.getKey();
        return null;
    }
    String label(DirectWifi.Peer peer){String room=room(peer);return room==null?"미등록 반주기":room+"번방";}
    List<DirectWifi.Peer> registered(List<DirectWifi.Peer> peers){
        List<DirectWifi.Peer> result=new ArrayList<>();
        for(DirectWifi.Peer peer:peers)if(peer!=null&&room(peer)!=null)result.add(peer);
        return sorted(result);
    }
    List<DirectWifi.Peer> sorted(List<DirectWifi.Peer> peers){
        List<DirectWifi.Peer> result=new ArrayList<>(peers);
        result.sort(Comparator.comparingInt((DirectWifi.Peer p)->room(p)==null?100:Integer.parseInt(room(p))).thenComparing(p->normalize(p.name)));
        return result;
    }
    // A QR can select a known room, never a host, password, song, or arbitrary command.
    String fromIntent(Intent intent){
        if(intent==null||!Intent.ACTION_VIEW.equals(intent.getAction()))return null;
        Uri uri=intent.getData();if(uri==null||uri.getFragment()!=null)return null;
        boolean app="neutinamu-p2".equals(uri.getScheme())&&"connect".equals(uri.getAuthority())&&"".equals(uri.getPath());
        boolean web="https".equals(uri.getScheme())&&"cyberkjh36.github.io".equals(uri.getAuthority())&&"/neutinamu-song-search/p2-room.html".equals(uri.getPath());
        if(!app&&!web)return null;
        try{
            if(!uri.getQueryParameterNames().equals(Collections.singleton("room"))||uri.getQueryParameters("room").size()!=1)return null;
            String room=uri.getQueryParameter("room");return devices.containsKey(room)?room:null;
        }catch(UnsupportedOperationException e){return null;}
    }
}
