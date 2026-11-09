"""Generate a dependency-free, reproducible Xcode project from checked-in sources."""
from pathlib import Path
import hashlib, json
ROOT = Path(__file__).resolve().parents[1]
def ident(s): return hashlib.sha256(s.encode()).hexdigest()[:24].upper()
def q(s): return json.dumps(str(s),ensure_ascii=False)
objects = {}
def obj(key,text):
    i=ident(key); objects[i]=text; return i
def refs(ids): return '('+','.join(ids)+',)' if ids else '()'
def configs(prefix,extra):
    settings={'CLANG_ENABLE_MODULES':'YES','SWIFT_VERSION':'5.0','IPHONEOS_DEPLOYMENT_TARGET':'16.0','SDKROOT':'iphoneos','SUPPORTED_PLATFORMS':'iphoneos iphonesimulator','TARGETED_DEVICE_FAMILY':'1','SWIFT_STRICT_CONCURRENCY':'minimal',**extra}
    ids=[]
    for mode in ['Debug','Release']:
        values={**settings,'SWIFT_OPTIMIZATION_LEVEL':'-Onone' if mode=='Debug' else '-O','DEBUG_INFORMATION_FORMAT':'dwarf-with-dsym','SWIFT_ACTIVE_COMPILATION_CONDITIONS':'DEBUG' if mode=='Debug' else ''}
        ids.append(obj(prefix+mode,'{isa=XCBuildConfiguration;name='+mode+';buildSettings={'+''.join(q(k)+'='+q(v)+';' for k,v in values.items())+'};}'))
    return obj(prefix+'configs','{isa=XCConfigurationList;buildConfigurations='+refs(ids)+';defaultConfigurationIsVisible=0;defaultConfigurationName=Release;}')
sources=sorted(list((ROOT/'App').glob('*.swift'))+list((ROOT/'Sources/P2Core').glob('*.swift')))
tests=sorted((ROOT/'UITests').glob('*.swift'))
def source_phase(paths,prefix):
    files=[]; builds=[]
    for p in paths:
        name=str(p.relative_to(ROOT)); f=obj('file'+name,'{isa=PBXFileReference;lastKnownFileType=sourcecode.swift;path='+q(name)+';sourceTree="<group>";}'); files.append(f)
        builds.append(obj('build'+name,'{isa=PBXBuildFile;fileRef='+f+';}'))
    return files,obj(prefix+'sources','{isa=PBXSourcesBuildPhase;buildActionMask=2147483647;files='+refs(builds)+';runOnlyForDeploymentPostprocessing=0;}')
files,app_sources=source_phase(sources,'app'); testfiles,test_sources=source_phase(tests,'test')
resources=[]
for name,kind in [('Prepared/Web','folder'),('Prepared/rooms.json','text.json'),('App/PrivacyInfo.xcprivacy','text.xml')]:
    f=obj('file'+name,'{isa=PBXFileReference;lastKnownFileType='+kind+';path='+q(name)+';sourceTree="<group>";}');files.append(f);resources.append(obj('build'+name,'{isa=PBXBuildFile;fileRef='+f+';}'))
app_resources=obj('appresources','{isa=PBXResourcesBuildPhase;buildActionMask=2147483647;files='+refs(resources)+';runOnlyForDeploymentPostprocessing=0;}')
app_product=obj('appproduct','{isa=PBXFileReference;explicitFileType=wrapper.application;includeInIndex=0;path=NeutinamuRemote.app;sourceTree=BUILT_PRODUCTS_DIR;}')
test_product=obj('testproduct','{isa=PBXFileReference;explicitFileType=wrapper.cfbundle;includeInIndex=0;path=RemoteUITests.xctest;sourceTree=BUILT_PRODUCTS_DIR;}')
products=obj('products','{isa=PBXGroup;children='+refs([app_product,test_product])+';name=Products;sourceTree="<group>";}')
main_group=obj('main','{isa=PBXGroup;children='+refs(files+testfiles+[products])+';sourceTree="<group>";}')
app_conf=configs('app',{'PRODUCT_NAME':'NeutinamuRemote','PRODUCT_BUNDLE_IDENTIFIER':'kr.neutinamu.p2.ios','INFOPLIST_FILE':'App/Info.plist','CODE_SIGN_ENTITLEMENTS':'App/Remote.entitlements','CODE_SIGN_STYLE':'Automatic'})
test_conf=configs('test',{'PRODUCT_NAME':'RemoteUITests','PRODUCT_BUNDLE_IDENTIFIER':'kr.neutinamu.p2.ios.uitests','GENERATE_INFOPLIST_FILE':'YES','TEST_TARGET_NAME':'NeutinamuRemote','CODE_SIGN_STYLE':'Automatic'})
app=obj('apptarget','{isa=PBXNativeTarget;buildConfigurationList='+app_conf+';buildPhases='+refs([app_sources,app_resources])+';buildRules=();dependencies=();name=NeutinamuRemote;productName=NeutinamuRemote;productReference='+app_product+';productType="com.apple.product-type.application";}')
dependency=obj('dependency','{isa=PBXTargetDependency;target='+app+';}')
test=obj('testtarget','{isa=PBXNativeTarget;buildConfigurationList='+test_conf+';buildPhases='+refs([test_sources])+';buildRules=();dependencies='+refs([dependency])+';name=RemoteUITests;productName=RemoteUITests;productReference='+test_product+';productType="com.apple.product-type.bundle.ui-testing";}')
project=obj('project','{isa=PBXProject;attributes={LastUpgradeCheck=1600;TargetAttributes={'+app+'={CreatedOnToolsVersion=16.0;};'+test+'={CreatedOnToolsVersion=16.0;TestTargetID='+app+';};};};buildConfigurationList='+configs('project',{})+';compatibilityVersion="Xcode 14.0";developmentRegion=ko;knownRegions=(ko,en,Base);mainGroup='+main_group+';productRefGroup='+products+';projectDirPath="";projectRoot="";targets='+refs([app,test])+';}')
out=ROOT/'NeutinamuRemote.xcodeproj';out.mkdir(exist_ok=True)
(out/'project.pbxproj').write_text('// !$*UTF8*$!\n{archiveVersion=1;classes={};objectVersion=56;objects={\n'+''.join(k+'='+v+'\n' for k,v in sorted(objects.items()))+'};rootObject='+project+';}\n')
scheme=out/'xcshareddata/xcschemes';scheme.mkdir(parents=True,exist_ok=True)
def buildref(i,name): return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{i}" BuildableName="{name}" BlueprintName="{name.split(".")[0]}" ReferencedContainer="container:NeutinamuRemote.xcodeproj"/>'
(scheme/'NeutinamuRemote.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{buildref(app,'NeutinamuRemote.app')}</BuildActionEntry></BuildActionEntries></BuildAction>
<TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO" parallelizable="NO">{buildref(test,'RemoteUITests.xctest')}</TestableReference></Testables></TestAction>
<LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{buildref(app,'NeutinamuRemote.app')}</BuildableProductRunnable></LaunchAction>
<ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">{buildref(app,'NeutinamuRemote.app')}</BuildableProductRunnable></ProfileAction><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>''')
print('Generated Xcode project and shared test/build scheme.')
