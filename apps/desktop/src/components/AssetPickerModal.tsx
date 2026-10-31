import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Search,
  RefreshCw,
  FolderOpen,
  Image as ImageIcon,
  FileCode,
  FileText,
  Check,
  Sparkles,
} from "lucide-react";
import { WorkspaceAsset, ArtifactKind } from "@visualloop/protocol";
import { coreClient } from "../services/coreClient";

interface AssetPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssetSelected?: (asset: WorkspaceAsset) => void;
  defaultWorkspaceRoot?: string;
}

export const AssetPickerModal: React.FC<AssetPickerModalProps> = ({
  isOpen,
  onClose,
  onAssetSelected,
  defaultWorkspaceRoot = "",
}) => {
  const [workspaceRoot, setWorkspaceRoot] = useState<string>(defaultWorkspaceRoot);
  const [assets, setAssets] = useState<WorkspaceAsset[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntrypoint, setSelectedEntrypoint] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterKind, setFilterKind] = useState<string>("all");
  const [isActivating, setIsActivating] = useState<boolean>(false);
  const folderInputRef = React.useRef<HTMLInputElement>(null);
  const singleFileInputRef = React.useRef<HTMLInputElement>(null);

  // Scan workspace for assets
  const fetchAssets = async (rootToScan?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await coreClient.getWorkspaceAssets(rootToScan || workspaceRoot);
      setAssets(data.assets || []);
      if (!workspaceRoot && data.workspaceRoot) {
        setWorkspaceRoot(data.workspaceRoot);
      }
      if (data.assets && data.assets.length > 0 && !selectedEntrypoint) {
        setSelectedEntrypoint(data.assets[0].entrypoint);
      }
    } catch (err: any) {
      setError(err.message || "Failed to scan folder for visual assets");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAssets();
    }
  }, [isOpen]);

  // Filtered assets list
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesSearch =
        searchQuery.trim().length === 0 ||
        asset.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.entrypoint.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesKind =
        filterKind === "all" ||
        (filterKind === "image" && asset.kind === "image") ||
        (filterKind === "svg" && asset.kind === "svg") ||
        (filterKind === "html" && asset.kind === "html") ||
        (filterKind === "pdf" && asset.kind === "pdf");

      return matchesSearch && matchesKind;
    });
  }, [assets, searchQuery, filterKind]);

  const selectedAsset = useMemo(() => {
    return assets.find((a) => a.entrypoint === selectedEntrypoint) || null;
  }, [assets, selectedEntrypoint]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleConfirmSelection = async () => {
    if (!selectedAsset || isActivating) return;
    setIsActivating(true);
    setError(null);
    try {
      await coreClient.selectWorkspaceAsset(selectedAsset.entrypoint, workspaceRoot);
      if (onAssetSelected) {
        onAssetSelected(selectedAsset);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to activate chosen asset");
    } finally {
      setIsActivating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#FFFFFF] border border-[#E5E5E5] rounded-xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden text-[#171717]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E5E5] bg-[#FAFAFA]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#171717] tracking-tight flex items-center gap-2">
                Project Visual Assets
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  {assets.length} found
                </span>
              </h2>
              <p className="text-xs text-[#737373]">
                Browse and select an AI-generated image, slide, SVG, or HTML to circle and review
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#737373] hover:text-[#171717] rounded-lg hover:bg-[#F0F0F0] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Directory Input & Quick Shortcuts */}
        <div className="px-6 py-3 bg-[#F9F9F9] border-b border-[#E5E5E5] space-y-2">
          {/* Hidden HTML5 Native Folder & File Pickers */}
          <input
            ref={folderInputRef}
            type="file"
            // @ts-ignore
            webkitdirectory=""
            directory=""
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                const file = e.target.files[0];
                const nativePath = (file as any).path;
                if (nativePath) {
                  const parts = nativePath.split("/");
                  parts.pop();
                  const relParts = file.webkitRelativePath.split("/");
                  relParts.pop();
                  for (let i = 0; i < relParts.length - 1; i++) {
                    parts.pop();
                  }
                  const detectedRoot = parts.join("/");
                  setWorkspaceRoot(detectedRoot);
                  fetchAssets(detectedRoot);
                }
              }
            }}
          />

          <input
            ref={singleFileInputRef}
            type="file"
            accept="image/*,.svg,.html,.htm,.pdf"
            className="hidden"
            onChange={async (e) => {
              if (e.target.files && e.target.files.length > 0) {
                const file = e.target.files[0];
                const nativePath = (file as any).path;
                if (nativePath) {
                  await coreClient.selectWorkspaceAsset(nativePath);
                  onClose();
                } else {
                  const reader = new FileReader();
                  reader.onload = async () => {
                    await coreClient.uploadAsset(file.name, reader.result as string);
                    onClose();
                  };
                  reader.readAsDataURL(file);
                }
              }
            }}
          />

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={workspaceRoot}
                onChange={(e) => setWorkspaceRoot(e.target.value)}
                placeholder="/path/to/project/folder..."
                className="w-full pl-3 pr-8 py-1.5 text-xs bg-[#FFFFFF] border border-[#D4D4D4] rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#FFFFFF] hover:bg-[#F2F2F2] border border-[#D4D4D4] text-[#171717] transition cursor-pointer shadow-xs"
              title="Open macOS folder picker to select project"
            >
              <FolderOpen className="w-3.5 h-3.5 text-teal-600" />
              <span>Browse Folder...</span>
            </button>

            <button
              type="button"
              onClick={() => singleFileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#FFFFFF] hover:bg-[#F2F2F2] border border-[#D4D4D4] text-[#171717] transition cursor-pointer shadow-xs"
              title="Select a single image or slide file directly"
            >
              <span>Choose File...</span>
            </button>

            <button
              type="button"
              onClick={() => fetchAssets()}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#171717] hover:bg-[#262626] text-[#FFFFFF] transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Scan Folder</span>
            </button>
          </div>

          {/* Quick Location Pills */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-[#737373] font-medium">Quick folders:</span>
            <button
              type="button"
              onClick={() => {
                const target = "/Users/mac/Desktop/skill see it edit it";
                setWorkspaceRoot(target);
                fetchAssets(target);
              }}
              className="px-2 py-0.5 rounded bg-[#EAEAEA] hover:bg-[#DFDFDF] text-[#404040] transition"
            >
              Current Workspace
            </button>
            <button
              type="button"
              onClick={() => {
                const target = "/Users/mac/Desktop/YaCheck-Project";
                setWorkspaceRoot(target);
                fetchAssets(target);
              }}
              className="px-2 py-0.5 rounded bg-[#EAEAEA] hover:bg-[#DFDFDF] text-[#404040] transition"
            >
              YaCheck-Project
            </button>
            <button
              type="button"
              onClick={() => {
                const target = "/Users/mac/Desktop";
                setWorkspaceRoot(target);
                fetchAssets(target);
              }}
              className="px-2 py-0.5 rounded bg-[#EAEAEA] hover:bg-[#DFDFDF] text-[#404040] transition"
            >
              Desktop
            </button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="px-6 py-2.5 border-b border-[#E5E5E5] flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A3A3A3]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search filenames..."
              className="w-full pl-8 pr-3 py-1 text-xs bg-[#FFFFFF] border border-[#E5E5E5] rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="flex items-center gap-1">
            {[
              { id: "all", label: "All" },
              { id: "image", label: "Images" },
              { id: "svg", label: "SVG" },
              { id: "html", label: "HTML / UI" },
              { id: "pdf", label: "PDF" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterKind(f.id)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition ${
                  filterKind === f.id
                    ? "bg-teal-50 text-teal-700 font-semibold border border-teal-200"
                    : "text-[#737373] hover:bg-[#F5F5F5]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content Area: Grid + Preview */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#FAFAFA]">
          {error && (
            <div className="p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center text-[#737373] space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-teal-600" />
              <p className="text-xs">Scanning project directory for visual assets...</p>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-[#E5E5E5] rounded-xl text-[#737373]">
              <ImageIcon className="w-8 h-8 text-[#A3A3A3] mb-2" />
              <p className="text-xs font-semibold text-[#171717]">No visual assets found</p>
              <p className="text-[11px] max-w-sm mt-1">
                Make sure your project folder contains images (.png, .jpg), slides, SVGs, or HTML.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredAssets.map((asset) => {
                const isSelected = asset.entrypoint === selectedEntrypoint;
                return (
                  <div
                    key={asset.entrypoint}
                    onClick={() => setSelectedEntrypoint(asset.entrypoint)}
                    className={`group relative flex flex-col rounded-xl overflow-hidden border transition cursor-pointer bg-[#FFFFFF] ${
                      isSelected
                        ? "border-teal-500 ring-2 ring-teal-500/30 shadow-md"
                        : "border-[#E5E5E5] hover:border-[#D4D4D4] hover:shadow-xs"
                    }`}
                  >
                    {/* Thumbnail Preview Surface */}
                    <div className="h-32 w-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden p-2 relative">
                      {asset.preview && asset.kind === "image" ? (
                        <img
                          src={asset.preview}
                          alt={asset.filename}
                          className="w-full h-full object-contain pointer-events-none select-none"
                        />
                      ) : asset.preview && asset.kind === "svg" ? (
                        <div
                          className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full pointer-events-none"
                          dangerouslySetInnerHTML={{ __html: asset.preview }}
                        />
                      ) : asset.kind === "html" ? (
                        <div className="flex flex-col items-center justify-center text-[#737373]">
                          <FileCode className="w-8 h-8 text-teal-600 mb-1" />
                          <span className="text-[10px] font-mono">HTML Document</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-[#737373]">
                          <FileText className="w-8 h-8 text-indigo-500 mb-1" />
                          <span className="text-[10px] font-mono">Document/Slide</span>
                        </div>
                      )}

                      {/* Kind Pill */}
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-black/60 text-white backdrop-blur-xs">
                        {asset.kind}
                      </span>

                      {/* Selected checkmark */}
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center shadow-sm">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </div>

                    {/* Metadata Footer */}
                    <div className="p-2.5 flex flex-col justify-between flex-1 border-t border-[#F0F0F0]">
                      <div className="text-xs font-semibold text-[#171717] truncate" title={asset.filename}>
                        {asset.filename}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-[#737373] mt-1 font-mono">
                        <span>{formatFileSize(asset.sizeBytes)}</span>
                        <span className="truncate max-w-[100px]" title={asset.entrypoint}>
                          {asset.entrypoint.split("/").slice(0, -1).join("/") || "."}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer & Activation Action */}
        <div className="px-6 py-3.5 bg-[#FFFFFF] border-t border-[#E5E5E5] flex items-center justify-between">
          <div className="text-xs text-[#525252]">
            {selectedAsset ? (
              <span className="flex items-center gap-1.5">
                <span className="text-[#171717] font-semibold">{selectedAsset.filename}</span>
                <span className="text-[#A3A3A3]">•</span>
                <span className="font-mono">{formatFileSize(selectedAsset.sizeBytes)}</span>
                <span className="text-[#A3A3A3]">•</span>
                <span className="text-teal-600 font-semibold uppercase">{selectedAsset.kind}</span>
              </span>
            ) : (
              <span>Please select an asset above</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-[#737373] hover:text-[#171717] hover:bg-[#F5F5F5] rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmSelection}
              disabled={!selectedAsset || isActivating}
              className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-lg bg-teal-600 hover:bg-teal-500 text-white transition disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {isActivating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading to Canvas...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Load to Canvas & Start Circling</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
